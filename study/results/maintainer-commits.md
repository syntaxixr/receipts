# Receipts study

81 changes from 12 repositories. Each one edits code and adds or edits tests; every such test ran with and without the change.

| Group | Changes | Judged | Proven | Mixed | Unproven | Weak only | Could not judge | No test located | Errors |
|---|---|---|---|---|---|---|---|---|---|
| All changes | 81 | 71 | 64 (90%) | 2 (3%) | 5 (7%) | 0 (0%) | 9 | 1 | 0 |
| Human-authored commits | 75 | 65 | 59 (91%) | 2 (3%) | 4 (6%) | 0 (0%) | 9 | 1 | 0 |
| Agent-authored (commit trailers or PR commits) | 6 | 6 | 5 (83%) | 0 (0%) | 1 (17%) | 0 (0%) | 0 | 0 | 0 |

*Judged*: at least one test ran on both sides. *Proven*: at least one test fails without the change, and none of the others is THEATER (GUARD tests next to proof are fine). *Mixed*: some tests prove the change, others are WEAK (or, for a refactor, some tests CHANGED). *Unproven*: every test passes without the change. *Weak only*: tests fail without the change only because the function they call did not exist yet.

## Tests

212 tests judged: 98 PROVEN (46%), 66 GUARD (31%), 11 THEATER (5%), 9 PRESERVED (4%), 9 SKIPPED (4%), 9 WEAK (4%), 7 BROKEN (3%), 3 CHANGED (1%)

## By repository

| Repository | Changes | Proven | Mixed | Unproven | Other |
|---|---|---|---|---|---|
| click | 8 | 7 | 0 | 0 | 1 |
| itsdangerous | 1 | 0 | 0 | 1 | 0 |
| markupsafe | 2 | 1 | 0 | 0 | 1 |
| sqlparse | 8 | 7 | 1 | 0 | 0 |
| humanize | 8 | 6 | 0 | 0 | 2 |
| marshmallow | 8 | 6 | 1 | 1 | 0 |
| more-itertools | 8 | 8 | 0 | 0 | 0 |
| tomlkit | 8 | 8 | 0 | 0 | 0 |
| dateutil | 8 | 3 | 0 | 1 | 4 |
| dayjs | 8 | 8 | 0 | 0 | 0 |
| ufo | 8 | 7 | 0 | 0 | 1 |
| defu | 6 | 3 | 0 | 2 | 1 |

## Agent-authored changes

| Change | Agent | Outcome | Verdicts |
|---|---|---|---|
| [sqlparse 519e4169](https://github.com/andialbrecht/sqlparse/commit/519e41698a172add8aa7b54ab4e94daad0af213e) Pair comment/dollar-quote delimiters at the lexer position | claude-code | proven | 1 PROVEN |
| [marshmallow 3bc191ab](https://github.com/marshmallow-code/marshmallow/commit/3bc191ab3c8cac8356839bcde0918cb6aed4d3a1) Fix Field.error_messages type to allow dict and list values (#2907) | claude-code | unproven | 1 THEATER |
| [more-itertools 2b8d5cdd](https://github.com/more-itertools/more-itertools/commit/2b8d5cddce4ea01f88a973551cd50479cf5fa45f) Issue 1284: don't let a bucket lookup invent a key | claude-code | proven | 4 PROVEN |
| [more-itertools def2dabe](https://github.com/more-itertools/more-itertools/commit/def2dabea858b6ecb84ee0c52e6e07929f2c409c) Fix one()/only() dropping a falsy user-supplied exception | claude-code | proven | 4 PROVEN |
| [tomlkit 67d3e865](https://github.com/python-poetry/tomlkit/commit/67d3e86502706df2a9ed67114ab67e25bcdcbbb7) Fix array of tables replacing a dotted key swallowing the next sibling | claude-code | proven | 1 PROVEN, 10 GUARD |
| [dayjs 99691c5f](https://github.com/iamkun/dayjs/commit/99691c5f3bd1371d3b763d5f9dfaed9a1945a477) fix: update updateLocale plugin to merge nested object properties inst | claude-code | proven | 1 PROVEN, 1 GUARD |

## Changes no test proves

Every test these changes added or edited passes without the change.

- [itsdangerous 9a25d989](https://github.com/pallets/itsdangerous/commit/9a25d989cd65c4991c2c8ac46ef55e0e8dfe49ab) update project files: `tests/test_itsdangerous/test_serializer.py::TestSerializer::test_changed_value`, `tests/test_itsdangerous/test_serializer.py::TestSerializer::test_bad_payload_exception`, `tests/test_itsdangerous/test_serializer.py::TestSerializer::test_loads_unsafe`
- [marshmallow 3bc191ab](https://github.com/marshmallow-code/marshmallow/commit/3bc191ab3c8cac8356839bcde0918cb6aed4d3a1) Fix Field.error_messages type to allow dict and list values (#2907) (claude-code): `tests/test_deserialization.py::test_required_message_can_be_changed`
- [dateutil ea7f441b](https://github.com/dateutil/dateutil/commit/ea7f441b455cabbae2bf98f2d10fd11724001155) Fix custom repr for ParserError: `dateutil/test/test_parser.py::test_parsererror_repr`
- [defu c7226f97](https://github.com/unjs/defu/commit/c7226f971740966282530745030123aa07ff7b17) fix: merge object strings of many types  (#44): `test/defu.test.ts::defu > multi defaults`, `test/defu.test.ts::defu > should merge types of more than two objects`, `test/defu.test.ts::defu > should allow partials within merge chain`
- [defu 1f3a701b](https://github.com/unjs/defu/commit/1f3a701bc3fd839344359ad5c2b358fbefd978cc) fix: add typing to allow for non-objects input args (#42): `test/defu.test.ts::defu > should handle non object first param`, `test/defu.test.ts::defu > should handle non object second param`, `test/defu.test.ts::defu > should ignore non-object arguments`

## Not judged

- [click bec59289](https://github.com/pallets/click/commit/bec59289d8cf9b9b4010642b2fee483e5f8eeefc) env: 3 BROKEN
- [markupsafe 80aff032](https://github.com/pallets/markupsafe/commit/80aff0325c83991e5c62ad741b9a85d65df18058) env: 1 BROKEN
- [humanize bada0f88](https://github.com/python-humanize/humanize/commit/bada0f88b4d115b96d94db1fe73b20579e84fc14) env: 2 SKIPPED
- [humanize b8b32583](https://github.com/python-humanize/humanize/commit/b8b32583d1958f41bbc8b96d50c6bef0b393e930) env: 1 SKIPPED
- [dateutil 5cf3e3cb](https://github.com/dateutil/dateutil/commit/5cf3e3cbfa1ba6a03830b4c26700dd0ad1e0399c) env: 1 BROKEN
- [dateutil b7668eaf](https://github.com/dateutil/dateutil/commit/b7668eaf95bc1bddb02c6e377cfe21c65fccc4c6) env: 4 SKIPPED
- [dateutil 82fc863a](https://github.com/dateutil/dateutil/commit/82fc863aa62b624318fbc6e2945bc5d8e3b030d2) env: 1 BROKEN
- [dateutil 07360b51](https://github.com/dateutil/dateutil/commit/07360b51b96e3a11aa21a9b00e89bfaf0d73b50f) env: 1 BROKEN
- [ufo 9713f2f1](https://github.com/unjs/ufo/commit/9713f2f1a5125223420182f8124c0a5c55f008ca) no-tests: no-tests
- [defu 4111333b](https://github.com/unjs/defu/commit/4111333b7f830712947b3d48c127f23061569620) env: 2 SKIPPED
