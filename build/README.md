# 빌드 파이프라인 (복구본, 2026-07-28)

원래 파이프라인은 임시 컨테이너(`/home/claude/seogu/`)에만 있었고 세션 종료와 함께 소멸했다.
`build.py`·`gen.py`·`pull_hub.sh`·`out_*.json`·`hub_all.json`·`vw/*.json` 전부 사라졌다.

여기 있는 것은 **배포본 `seogu.html`에서 역추출해 복원한 후반부 파이프라인**이다.

## 지금 되는 것

```
build/data/seogu/*.json  +  build/template/seogu.tmpl.html  ──gen.py──►  seogu.html
```

```bash
python3 build/gen.py seogu --check     # 기존 파일과 대조만 (쓰지 않음)
python3 build/gen.py seogu             # 저장소 루트에 seogu.html 생성
python3 build/gen.py seogu -o /tmp/x.html
```

**검증 완료**: 재생성 결과가 배포본과 바이트 단위로 일치한다 (md5 `cf64bbfac34190f261c3f4e956c7fad0`).

`extract.py`는 역방향이다. 배포본 HTML을 다시 데이터+템플릿으로 쪼갠다.
HTML을 직접 손본 뒤 그 변경을 파이프라인에 반영할 때 쓴다.

```bash
python3 build/extract.py seogu
```

## 원래 gen.py의 결함 2개는 구조적으로 제거했다

| 원래 문제 | 지금 |
|---|---|
| gen.py에 v1.1 패치(빈집 밀도 레이어)가 없어 **재실행하면 기능이 소멸**했다 | 템플릿을 배포본에서 뽑으므로 소실이 원리상 불가능 |
| 출력 파일명이 `index.html`이라 **공유 랜딩을 덮어써 기장판이 라이브에서 사라진 사고**가 있었다 | `index.html`은 출력 대상에서 하드 차단 (`FORBIDDEN`) |

## 아직 없는 것 (전반부)

원자료 수집·가공 단계는 복구되지 않았다. 원본이 없어 역추출이 불가능하다.

| 단계 | 상태 |
|---|---|
| [1] VWorld 수집 → `vw/*.json` | ✗ 소멸. 재수집 필요 (컨테이너가 아닌 맥에서는 IP 차단 여부 미확인) |
| [2] 법정동 코드 스캔 | ✗ 소멸. 결과 24개 법정동은 본부 문서에 표로 남아 있음 |
| [3] 건축HUB 표제부 → `hub_all.json` (32MB) | ✗ 소멸. 재수집 수 시간 |
| [4] `build.py` (좌표변환·공간조인·PNU 페어링) | ✗ 소멸. 규칙은 본부 SOP에 남아 있으나 코드는 재작성 필요 |
| [5] `gen.py` | ✓ **복구됨 (이 폴더)** |

즉 **지금 데이터를 고칠 수는 있어도, 새 지역을 원자료부터 만들 수는 없다.**
`build/data/seogu/*.json`이 사실상 현재의 마스터 데이터다 — 이게 사라지면 [1]~[3] 재수집으로만 복구된다.

참고로 분리된 JSON 크기는 문서에 기록된 원래 `out_*.json` 실측치와 정확히 일치한다
(BD 4,227,654B / ZONING 213,195B / SITE 51,718B / EMDV 22,329B / EMD 21,571B /
SIGG 17,625B / SITEPAR 14,489B / VD 1,083B). 원본 중간 산출물이 그대로 복원됐다는 뜻이다.
`CL`만 36,076B로 원래 `out_clusters.json`(35,935B)보다 크다 — gen.py가 개별공시지가(`jiga`)를
각 레코드에 병합했기 때문이다. (기술부록이 말한 `JIGA` 딕셔너리의 행방이 이것이다.)

## gijang.html은 대상이 아니다

서구판과 **별도 코드베이스**다(기술부록 Y-1). 데이터 상수와 코드 상수가 섞여 있고
`POP`은 unquoted key, `RAMP`·`AGEMATCH`는 작은따옴표라 JSON이 아니다.
`extract.py`의 `TARGETS['gijang']`을 빈 목록으로 막아 두었다. 별도 작업으로 남긴다.

## 주의

- `seogu.html`은 5.5MB 단일 원본이다. 직접 편집 시 반드시 백업 커밋을 먼저 만든다.
- 데이터만 고칠 때는 HTML을 직접 건드리지 말고 `data/seogu/*.json` 수정 → `gen.py` 실행이 정석이다.
- API 키는 이 폴더 어디에도 없다. 실값은 노션 API 키 트래커에만 있다.
