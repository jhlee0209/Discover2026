"""데이터팀 엑셀(첫 번째 시트)을 data/restaurants.json(설계서 5-1 형식)으로 변환.

사용법: python3 tools/xlsx_to_json.py [엑셀 경로]   (기본값: data/menu.xlsx)
필요 패키지: openpyxl
GitHub에서 data/menu.xlsx를 교체하면 .github/workflows/menu-data.yml이 이 스크립트를 자동 실행한다.
"""
import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "menu.xlsx"
OUT = ROOT / "data" / "restaurants.json"

# 엑셀 '구역' 값 → 설계서 area 코드. 새 구역 표기가 생기면 여기에 추가
AREA = {
    "LS용산타워 B1": "ls",
    "LS용산타워": "ls",
    "LS타워·아모레": "ls",
    "AP본사 B1": "ls",
    "AP본사 1층": "ls",
    "인근 아스테리움 B1": "ls",
    "인근 아스테리움": "ls",
    "인근 용리단길": "yr",
    "인근": "yr",
    "한강로동": "yr",
    "용산 아이파크몰": "ipark",
    "편의점": "cvs",
}
SOURCE = {"공식값": "official", "공식": "official", "추정치": "est", "추정": "est"}
# 편의점은 엑셀 '구역'에 건물명이 적혀 있으므로 식당명으로 판별해 area=cvs로 둔다
CVS_BRANDS = ("CU ", "GS25", "세븐일레븐", "이마트24", "미니스톱")
HEADER = ["구역", "식당명", "메뉴명", "가격(원)", "칼로리(kcal)", "칼로리 출처",
          "점심 영업", "저녁 영업", "심야 영업", "탄수화물(g)", "단백질(g)", "지방(g)", "비고"]


def key(v):
    # 구글 폼 선택지('AP 본사 B1')와 엑셀('AP본사 B1')의 띄어쓰기 차이를 무시
    return "".join(str(v or "").split())


AREA_KEY = {key(k): v for k, v in AREA.items()}
SOURCE_KEY = {key(k): v for k, v in SOURCE.items()}


def ox(v, col):
    v = key(v).upper()
    if v not in ("O", "X"):
        raise ValueError(f"{col}은(는) O 또는 X여야 함 (현재: {v or '빈칸'})")
    return v == "O"


def num(v):
    return None if v in (None, "") else round(float(v))


def main(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head = next(i for i, r in enumerate(rows) if r and r[0] == "구역")
    if list(rows[head][: len(HEADER)]) != HEADER:
        raise ValueError(f"열 제목이 예상과 다름: {rows[head]}")

    out, rest_ids, errors = [], {}, []
    for n, r in enumerate(rows[head + 1:], start=head + 2):
        if not r or not r[1]:
            continue
        area_txt, rest, menu, price, kcal, src, lu, di, la, c, p, f, note = r[:13]
        where = f"{n}행 {rest} / {menu}"
        try:
            if str(rest).startswith(CVS_BRANDS):
                area = "cvs"
            elif key(area_txt) in AREA_KEY:
                area = AREA_KEY[key(area_txt)]
            else:
                raise ValueError(f"구역 '{area_txt}'을(를) 알 수 없음 (tools/xlsx_to_json.py의 AREA 표에 추가 필요)")
            if key(src) not in SOURCE_KEY:
                raise ValueError(f"칼로리 출처는 공식값 또는 추정치여야 함 (현재: {src or '빈칸'})")
            rid = rest_ids.setdefault(rest, len(rest_ids) + 1)
            seq = sum(1 for m in out if m["restaurant"] == rest) + 1
            out.append({
                "id": f"r{rid:02d}-{seq:02d}",
                "restaurant": str(rest).strip(),
                "area": area,
                "menu": str(menu).strip(),
                "price": num(price),
                "kcal": num(kcal),
                "source": SOURCE_KEY[key(src)],
                "open": {"lunch": ox(lu, "점심 영업"), "dinner": ox(di, "저녁 영업"), "late": ox(la, "심야 영업")},
                "carb": num(c), "protein": num(p), "fat": num(f),
                "note": str(note).strip() if note not in (None, "") else None,
            })
            if out[-1]["price"] is None or out[-1]["kcal"] is None:
                raise ValueError("가격 또는 칼로리가 빈칸")
        except (TypeError, ValueError) as e:
            errors.append(f"{where}: {e}")

    if errors:
        print("변환 실패 — 아래 행을 고쳐 주세요:\n" + "\n".join(errors))
        sys.exit(1)
    OUT.write_text("[\n" + ",\n".join("  " + json.dumps(m, ensure_ascii=False) for m in out) + "\n]\n", encoding="utf-8")
    print(f"{len(out)}개 메뉴 · {len(rest_ids)}개 식당 → {OUT}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else SRC)
