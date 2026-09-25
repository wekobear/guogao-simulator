#!/usr/bin/env python3
"""过稿模拟器：内容规则校验器 + 六结局可达性路径搜索。

- 校验 content/game.v1.json 的结构与数值自洽性
- 复刻总纲规则（评分、等级、通过、随机、阶段转换）
- 搜索六个结局与 S 级评审的确定性路径，写入 fixtures/golden-paths.json
用法：python3 tools/verify_spec.py
"""

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT_PATH = ROOT / "src" / "content" / "game.v1.json"
FIXTURE_PATH = ROOT / "fixtures" / "golden-paths.json"

ENDINGS = ["PASS_PROTECTED", "PASS_COMPROMISE", "BURNOUT", "FIRED", "LOOP", "QUIT"]
PHASES = ["PREPARE", "REVIEW", "RESPOND", "EVENT", "BONUS", "PARTY", "ENDING"]


class Cfg:
    def __init__(self, data):
        self.data = data
        c = data["config"]
        self.pass_ = c["pass"]
        self.w = c["scoreWeights"]
        self.grade_bounds = sorted(c["gradeBounds"], key=lambda b: -b["min"])
        self.bonus_pool = c["bonusPool"]
        self.boss_shares = c["bossShares"]
        self.neg = c["negotiate"]
        self.red = c["redPacket"]

    def grade(self, score):
        for b in self.grade_bounds:
            if score >= b["min"]:
                return b["grade"]
        return "D"

    def compute_score(self, s):
        raw = (
            self.w["quality"] * s["quality"]
            + self.w["trust"] * s["trust"]
            + self.w["evidence"] * s["evidence"]
            - self.w["scopeDebtPenalty"] * s["scopeDebt"]
            + 0.5
        )
        return max(0, min(100, int(raw // 1)))

    def pass_reasons(self, s, score):
        reasons = []
        if score < self.pass_["minScore"]:
            reasons.append("score")
        if s["trust"] < self.pass_["minTrust"]:
            reasons.append("trust")
        if not (s["evidence"] >= self.pass_["minEvidence"] or s["trust"] >= self.pass_["altTrust"]):
            reasons.append("evidenceOrTrust")
        return reasons


def clamp_stats(s):
    out = {}
    for k in ["quality", "trust", "energy", "evidence"]:
        out[k] = max(0, min(100, round(s[k])))
    out["scopeDebt"] = max(0, min(3, round(s["scopeDebt"])))
    return out


def apply_delta(s, d):
    return clamp_stats({k: s[k] + d.get(k, 0) for k in s})


def next_u32(state):
    return (1664525 * state + 1013904223) & 0xFFFFFFFF


def weighted_pick(items, u):
    total = sum(i["weight"] for i in items)
    target = u * total
    cum = 0
    for i in items:
        cum += i["weight"]
        if target < cum:
            return i
    return items[-1]


def review_text(grade, passed, cfg, content):
    r = content["reviews"]
    parts = [r["prefix"]]
    if grade == "S":
        parts.append(r["sGradeLine"])
    parts.append(r["lines"][grade]["passed" if passed else "fail"])
    return "".join(parts)


def make_review(round_, stats, cfg, content):
    score = cfg.compute_score(stats)
    grade = cfg.grade(score)
    reasons = cfg.pass_reasons(stats, score)
    return {
        "round": round_,
        "score": score,
        "grade": grade,
        "passed": not reasons,
        "reasonIds": reasons,
        "text": review_text(grade, not reasons, cfg, content),
    }


def new_run(seed, template, content):
    t = next(x for x in content["templates"] if x["id"] == template)
    return {
        "seed": seed & 0xFFFFFFFF,
        "rngState": seed & 0xFFFFFFFF,
        "seq": 0,
        "phase": "PREPARE",
        "templateId": template,
        "round": 1,
        "submittedCount": 0,
        "stats": dict(t["stats"]),
        "seenEventIds": [],
        "pendingEventId": None,
        "bonus": None,
        "endingId": None,
        "_review": None,
    }


def apply_action(run, action, content, cfg):
    """返回 (新状态, 是否生效)；非法动作返回 (原状态, None)。与 TS reducer 保持一致。"""
    r = copy.deepcopy(run)
    typ = action["type"]
    aid = action.get("id")

    if typ == "SUBMIT_PREP":
        if r["phase"] != "PREPARE":
            return run, None
        prep = next((p for p in content["preparations"] if p["id"] == aid), None)
        if not prep:
            return run, None
        r["stats"] = apply_delta(r["stats"], prep["deltas"])
        r["seq"] += 1
        if r["stats"]["energy"] <= 0:
            r["phase"] = "ENDING"
            r["endingId"] = "BURNOUT"
            return r, True
        review = make_review(r["round"], r["stats"], cfg, content)
        r["submittedCount"] += 1
        r["phase"] = "REVIEW"
        r["_review"] = review
        return r, True

    if typ == "CONFIRM_QUIT":
        if r["phase"] not in ("PREPARE", "RESPOND"):
            return run, None
        r["seq"] += 1
        r["phase"] = "ENDING"
        r["endingId"] = "QUIT"
        return r, True

    if typ == "CONTINUE_REVIEW":
        if r["phase"] != "REVIEW":
            return run, None
        passed = bool(run["_review"] and run["_review"]["passed"])
        r["seq"] += 1
        if passed:
            u = next_u32(r["rngState"])
            r["rngState"] = u
            share = cfg.boss_shares[min(2, int((u / 4294967296) * 3))]
            r["bonus"] = {"initialBossShare": share, "playerShare": None, "redPacket": 0, "cash": 0}
            r["phase"] = "BONUS"
            return r, True
        if r["round"] < 3:
            r["phase"] = "RESPOND"
            return r, True
        r["phase"] = "ENDING"
        r["endingId"] = "FIRED" if r["stats"]["trust"] <= 25 else "LOOP"
        return r, True

    if typ == "CHOOSE_RESPONSE":
        if r["phase"] != "RESPOND":
            return run, None
        resp = next((x for x in content["responses"] if x["id"] == aid), None)
        if not resp:
            return run, None
        r["stats"] = apply_delta(r["stats"], resp["deltas"])
        r["seq"] += 1
        if r["stats"]["energy"] <= 0:
            r["phase"] = "ENDING"
            r["endingId"] = "BURNOUT"
            return r, True
        pool = [e for e in content["events"] if e["id"] not in set(r["seenEventIds"])]
        u = next_u32(r["rngState"])
        r["rngState"] = u
        ev = weighted_pick(pool, u / 4294967296)
        r["seenEventIds"] = list(r["seenEventIds"]) + [ev["id"]]
        r["pendingEventId"] = ev["id"]
        r["phase"] = "EVENT"
        return r, True

    if typ == "CHOOSE_EVENT_OPTION":
        if r["phase"] != "EVENT" or not r["pendingEventId"]:
            return run, None
        ev = next((e for e in content["events"] if e["id"] == r["pendingEventId"]), None)
        opt = next((o for o in ev["options"] if o["id"] == aid), None) if ev else None
        if not opt:
            return run, None
        r["stats"] = apply_delta(r["stats"], opt["deltas"])
        r["seq"] += 1
        if r["stats"]["energy"] <= 0:
            r["phase"] = "ENDING"
            r["endingId"] = "BURNOUT"
            return r, True
        r["round"] = min(3, r["round"] + 1)
        r["pendingEventId"] = None
        r["phase"] = "PREPARE"
        r["_review"] = None
        return r, True

    if typ == "CHOOSE_BONUS":
        if r["phase"] != "BONUS" or not r["bonus"]:
            return run, None
        r["seq"] += 1
        if aid == "accept":
            share = 100 - r["bonus"]["initialBossShare"]
            r["bonus"] = {
                **r["bonus"],
                "playerShare": share,
                "cash": round(cfg.bonus_pool * share / 100),
            }
            r["phase"] = "PARTY"
            return r, True
        if aid == "negotiate":
            req = cfg.neg["requires"]
            if not (r["stats"]["evidence"] >= req["evidence"] and r["stats"]["trust"] >= req["trust"]):
                return run, None
            share = cfg.neg["playerShare"]
            r["bonus"] = {
                **r["bonus"],
                "playerShare": share,
                "cash": round(cfg.bonus_pool * share / 100),
            }
            r["phase"] = "PARTY"
            return r, True
        return run, None

    if typ == "CHOOSE_PARTY":
        if r["phase"] != "PARTY" or not r["bonus"]:
            return run, None
        r["seq"] += 1
        red = cfg.red["self"] if aid == "self" else cfg.red["boss"]
        r["bonus"] = {**r["bonus"], "redPacket": red, "cash": r["bonus"]["cash"] + red}
        r["phase"] = "ENDING"
        r["endingId"] = (
            "PASS_PROTECTED" if (r["bonus"]["playerShare"] or 0) >= 70 else "PASS_COMPROMISE"
        )
        return r, True

    return run, None


def state_key(run):
    return json.dumps(
        [
            run["phase"],
            run["round"],
            run["submittedCount"],
            run["rngState"],
            run["stats"],
            sorted(run["seenEventIds"]),
            run["pendingEventId"],
            run["bonus"],
            run["_review"],
        ],
        sort_keys=True,
    )


def snapshot(run):
    snap = {
        "phase": run["phase"],
        "round": run["round"],
        "submittedCount": run["submittedCount"],
        "stats": run["stats"],
    }
    if run.get("_review"):
        snap["review"] = {
            "score": run["_review"]["score"],
            "grade": run["_review"]["grade"],
            "passed": run["_review"]["passed"],
        }
    if run["endingId"]:
        snap["endingId"] = run["endingId"]
    if run["bonus"]:
        snap["bonusCash"] = run["bonus"]["cash"]
        snap["playerShare"] = run["bonus"]["playerShare"]
    return snap


def actions_for(run, content, cfg):
    acts = []
    if run["phase"] == "PREPARE":
        for p in content["preparations"]:
            acts.append({"type": "SUBMIT_PREP", "id": p["id"]})
        acts.append({"type": "CONFIRM_QUIT"})
    elif run["phase"] == "REVIEW":
        acts.append({"type": "CONTINUE_REVIEW"})
    elif run["phase"] == "RESPOND":
        for x in content["responses"]:
            acts.append({"type": "CHOOSE_RESPONSE", "id": x["id"]})
        acts.append({"type": "CONFIRM_QUIT"})
    elif run["phase"] == "EVENT":
        ev = next(e for e in content["events"] if e["id"] == run["pendingEventId"])
        for o in ev["options"]:
            acts.append({"type": "CHOOSE_EVENT_OPTION", "id": o["id"]})
    elif run["phase"] == "BONUS":
        acts.append({"type": "CHOOSE_BONUS", "id": "accept"})
        req = cfg.neg["requires"]
        if run["stats"]["evidence"] >= req["evidence"] and run["stats"]["trust"] >= req["trust"]:
            acts.append({"type": "CHOOSE_BONUS", "id": "negotiate"})
    elif run["phase"] == "PARTY":
        acts.append({"type": "CHOOSE_PARTY", "id": "self"})
        acts.append({"type": "CHOOSE_PARTY", "id": "boss"})
    return acts


def search(seed, content, cfg):
    """DFS 搜索：返回 {endingId: path} 与 S 级示例路径。"""
    found = {}
    s_path = None
    visited = set()

    def dfs(run, actions, snaps, saw_s):
        nonlocal s_path
        if run["phase"] == "ENDING":
            ending = run["endingId"]
            if ending not in found:
                found[ending] = {"actions": list(actions), "expected": list(snaps), "templateId": run["templateId"]}
            return len(found) < len(ENDINGS)
        key = state_key(run)
        if key in visited:
            return True
        visited.add(key)
        for act in actions_for(run, content, cfg):
            nxt, ok = apply_action(run, act, content, cfg)
            if not ok:
                continue
            next_saw_s = saw_s or bool(nxt.get("_review") and nxt["_review"].get("grade") == "S")
            if next_saw_s and s_path is None and nxt.get("_review"):
                s_path = list(actions) + [act]
            actions.append(act)
            snaps.append(snapshot(nxt))
            dfs(nxt, actions, snaps, next_saw_s)
            actions.pop()
            snaps.pop()
            if len(found) == len(ENDINGS) and s_path:
                return False
        return True

    for template in [t["id"] for t in content["templates"]]:
        run = new_run(seed, template, content)
        # 首轮评审快照挂到 run 上
        dfs(run, [], [], False)
        if len(found) == len(ENDINGS) and s_path:
            break
    return found, s_path


def check_content(content, cfg):
    errors = []

    def dup(ids, what):
        if len(ids) != len(set(ids)):
            errors.append(f"{what} ID 重复")

    dup([t["id"] for t in content["templates"]], "模板")
    dup([p["id"] for p in content["preparations"]], "准备动作")
    dup([r["id"] for r in content["responses"]], "回应")
    dup([e["id"] for e in content["events"]], "插曲")
    dup([e["id"] for e in content["endings"]], "结局")
    for e in content["events"]:
        dup([o["id"] for o in e["options"]], f"插曲 {e['id']} 选项")
        if len(e["options"]) < 2:
            errors.append(f"插曲 {e['id']} 选项不足两个")
        if not isinstance(e["weight"], int) or e["weight"] <= 0:
            errors.append(f"插曲 {e['id']} 权重必须是正整数")
    for ending in ENDINGS:
        if not any(e["id"] == ending for e in content["endings"]):
            errors.append(f"缺少结局 {ending}")
    bounds = sorted(content["config"]["gradeBounds"], key=lambda b: -b["min"])
    if bounds[-1]["min"] != 0:
        errors.append("等级未覆盖 0 分")
    for t in content["templates"]:
        for k in ["quality", "trust", "energy", "evidence", "scopeDebt"]:
            if k not in t["stats"]:
                errors.append(f"模板 {t['id']} 缺少 {k}")
    allowed = {"quality", "trust", "energy", "evidence", "scopeDebt"}
    for group in ["preparations", "responses"]:
        for item in content[group]:
            extra = set(item["deltas"]) - allowed
            if extra:
                errors.append(f"{item['id']} 含非法 delta 字段 {extra}")
    for e in content["events"]:
        for o in e["options"]:
            extra = set(o["deltas"]) - allowed
            if extra:
                errors.append(f"{e['id']}/{o['id']} 含非法 delta 字段 {extra}")
    return errors


def check_rules(content, cfg):
    errors = []
    # T02 等级边界
    for score, grade in [(34, "D"), (35, "C"), (49, "C"), (50, "B"), (64, "B"), (65, "A"), (79, "A"), (80, "S"), (100, "S"), (0, "D")]:
        got = cfg.grade(score)
        if got != grade:
            errors.append(f"等级边界错误：{score} 应为 {grade}，得到 {got}")
    # T03 高分但信任不足
    s = {"quality": 100, "trust": 39, "energy": 50, "evidence": 100, "scopeDebt": 0}
    score = cfg.compute_score(s)
    reasons = cfg.pass_reasons(s, score)
    if "trust" not in reasons or cfg.pass_reasons(s, score) == []:
        errors.append("T03：高分低信任应不通过且原因含 trust")
    # T04
    s = {"quality": 100, "trust": 40, "energy": 50, "evidence": 20, "scopeDebt": 0}
    score = cfg.compute_score(s)
    if score != 73 or cfg.grade(score) != "A" or cfg.pass_reasons(s, score) != []:
        errors.append(f"T04：应为 73/A/通过，得到 {score}/{cfg.grade(score)}/{cfg.pass_reasons(s, score)}")
    # T05 替代条件：trust>=75 且 evidence<20
    s = {"quality": 80, "trust": 75, "energy": 50, "evidence": 5, "scopeDebt": 0}
    score = cfg.compute_score(s)
    if score < 65 or cfg.pass_reasons(s, score) != []:
        errors.append("T05：信任 75 应可替代凭证条件")
    # 截断
    s = {"quality": 95, "trust": 95, "energy": 95, "evidence": 95, "scopeDebt": 1}
    s2 = apply_delta(s, {"energy": 25, "quality": 10, "scopeDebt": 3})
    if s2["energy"] != 100 or s2["quality"] != 100 or s2["scopeDebt"] != 3:
        errors.append("截断错误")
    # 随机第一步
    if next_u32(1) != 1015568748:
        errors.append("LCG 首步与总纲示例不一致")
    # 奖金数学 T16/T17/T18
    for share, expect in [(70, 320), (75, 270), (80, 220)]:
        cash = round(cfg.bonus_pool * (100 - share) / 100) + cfg.red["self"]
        if cash != expect:
            errors.append(f"T16：老板 {share}% 应得 {expect}，得到 {cash}")
    if round(cfg.bonus_pool * 75 / 100) + 20 != 770:
        errors.append("T17：谈回 75% + 红包应为 770")
    if round(cfg.bonus_pool * 75 / 100) + 0 != 750:
        errors.append("T18：谈回 75% + 老板红包应为 750")
    return errors


def main():
    content = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    cfg = Cfg(content)
    problems = check_content(content, cfg) + check_rules(content, cfg)
    if problems:
        print("校验失败：")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)

    found, s_path = search(1, content, cfg)
    missing = [e for e in ENDINGS if e not in found]
    if missing:
        print(f"结局不可达：{missing}")
        sys.exit(1)

    fixture = {
        "seed": 1,
        "contentVersion": content["contentVersion"],
        "generatedBy": "tools/verify_spec.py",
        "paths": [found[e] | {"endingId": e} for e in ENDINGS],
        "sGradePath": s_path,
    }
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(json.dumps(fixture, ensure_ascii=False, indent=2), encoding="utf-8")

    print("内容校验：通过")
    print("规则边界（等级/评分/通过/截断/随机/奖金）：通过")
    print(f"结局可达：{len(found)}/6")
    for e in ENDINGS:
        p = found[e]
        last = p["expected"][-1]
        print(
            f"  {e:<16} 模板 {p['templateId']:<9} 步数 {len(p['actions']):>2}  "
            f"最终 stats={last['stats']} 现金={last.get('bonusCash', 0)}"
        )
    print(f"S 级路径：{'已找到' if s_path else '未找到'}")
    print(f"fixture 已写入 {FIXTURE_PATH}")
    if not s_path:
        sys.exit(1)


if __name__ == "__main__":
    main()
