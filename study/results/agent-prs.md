# Receipts study

100 changes from 5 repositories. Each one edits code and adds or edits tests; every such test ran with and without the change.

| Group | Changes | Judged | Proven | Mixed | Unproven | Weak only | Could not judge | No test located | Errors |
|---|---|---|---|---|---|---|---|---|---|
| All changes | 100 | 91 | 75 (82%) | 5 (5%) | 2 (2%) | 9 (10%) | 9 | 0 | 0 |
| Human-authored commits | 0 | 0 | 0 (–) | 0 (–) | 0 (–) | 0 (–) | 0 | 0 | 0 |
| Agent-authored (commit trailers or PR commits) | 100 | 91 | 75 (82%) | 5 (5%) | 2 (2%) | 9 (10%) | 9 | 0 | 0 |

*Judged*: at least one test ran on both sides. *Proven*: at least one test fails without the change, and none of the others is THEATER (GUARD tests next to proof are fine). *Mixed*: some tests prove the change, others are WEAK (or, for a refactor, some tests CHANGED). *Unproven*: every test passes without the change. *Weak only*: tests fail without the change only because the function they call did not exist yet.

## Tests

591 tests judged: 284 PROVEN (48%), 137 GUARD (23%), 79 WEAK (13%), 57 BROKEN (10%), 31 SKIPPED (5%), 2 THEATER (0%), 1 FLAKY (0%)

## By repository

| Repository | Changes | Proven | Mixed | Unproven | Other |
|---|---|---|---|---|---|
| claude-agent-sdk-python | 20 | 12 | 1 | 1 | 6 |
| llm | 20 | 17 | 1 | 0 | 2 |
| mcp-python-sdk | 20 | 15 | 0 | 1 | 4 |
| openai-agents-python | 20 | 12 | 2 | 0 | 6 |
| fastmcp | 20 | 19 | 1 | 0 | 0 |

## Agent-authored changes

| Change | Agent | Outcome | Verdicts |
|---|---|---|---|
| [claude-agent-sdk-python #1307](https://github.com/anthropics/claude-agent-sdk-python/pull/1307) fix: default sandbox.failIfUnavailable to true when sandbox is enabled | claude-code | proven | 3 PROVEN, 2 GUARD |
| [claude-agent-sdk-python #1306](https://github.com/anthropics/claude-agent-sdk-python/pull/1306) fix: honor skipMcpDiscovery on local plugins via --plugin-dir-no-mcp | claude-code | proven | 1 PROVEN |
| [claude-agent-sdk-python #1305](https://github.com/anthropics/claude-agent-sdk-python/pull/1305) fix: raise ControlRequestError (a ClaudeSDKError) for failed control r | claude-code | weak | 4 WEAK |
| [claude-agent-sdk-python #1291](https://github.com/anthropics/claude-agent-sdk-python/pull/1291) feat(transport): CLAUDE_AGENT_SDK_NO_BUNDLE to skip the bundled CLI | claude-code | proven | 3 GUARD, 4 PROVEN |
| [claude-agent-sdk-python #1209](https://github.com/anthropics/claude-agent-sdk-python/pull/1209) fix(transport): default an enabled sandbox to failIfUnavailable | claude-code | proven | 2 PROVEN, 3 GUARD |
| [claude-agent-sdk-python #1208](https://github.com/anthropics/claude-agent-sdk-python/pull/1208) fix(sessions): pick the last JSON field match by position, not per pat | claude-code | proven | 2 PROVEN |
| [claude-agent-sdk-python #1103](https://github.com/anthropics/claude-agent-sdk-python/pull/1103) fix(query): only defer the stdin close for delegated agent tasks | claude-code | weak | 2 BROKEN, 3 WEAK |
| [claude-agent-sdk-python #1101](https://github.com/anthropics/claude-agent-sdk-python/pull/1101) fix(transport): address review feedback on oversized-prompt spill | claude-code | weak | 4 WEAK |
| [claude-agent-sdk-python #1087](https://github.com/anthropics/claude-agent-sdk-python/pull/1087) docs: add release note for system prompt validation | claude-code | proven | 1 PROVEN |
| [claude-agent-sdk-python #1058](https://github.com/anthropics/claude-agent-sdk-python/pull/1058) Address review: raise on non-list assistant content; fold tests | claude-code | proven | 2 PROVEN |
| [claude-agent-sdk-python #1029](https://github.com/anthropics/claude-agent-sdk-python/pull/1029) fix: carry skills/ and per-project memory/ into materialized resume co | claude-code | proven | 2 PROVEN, 2 GUARD |
| [claude-agent-sdk-python #1016](https://github.com/anthropics/claude-agent-sdk-python/pull/1016) fix: correct task_updated status vocabulary to match the CLI | claude-code | weak | 10 WEAK |
| [claude-agent-sdk-python #1014](https://github.com/anthropics/claude-agent-sdk-python/pull/1014) chore(session_stores): janitorial anyio cleanup | claude-code | env | 8 SKIPPED |
| [claude-agent-sdk-python #1010](https://github.com/anthropics/claude-agent-sdk-python/pull/1010) fix: document /etc/hosts sandbox issue and add bwrapExtraBinds config | claude-code | unproven | 1 THEATER |
| [claude-agent-sdk-python #1008](https://github.com/anthropics/claude-agent-sdk-python/pull/1008) fix: register hooks before replaying deferred tools on resume | claude-code | env | 1 BROKEN |
| [claude-agent-sdk-python #1007](https://github.com/anthropics/claude-agent-sdk-python/pull/1007) fix: include hook lifecycle events in message stream when include_hook | claude-code | proven | 3 PROVEN, 4 GUARD |
| [claude-agent-sdk-python #990](https://github.com/anthropics/claude-agent-sdk-python/pull/990) fix(session_store): port transcript mirror, session resume, and sessio | claude-code | mixed | 6 PROVEN, 1 GUARD, 5 BROKEN, 1 WEAK |
| [claude-agent-sdk-python #988](https://github.com/anthropics/claude-agent-sdk-python/pull/988) fix(parser): surface TypeError as MessageParseError on malformed paylo | claude-code | proven | 3 PROVEN |
| [claude-agent-sdk-python #985](https://github.com/anthropics/claude-agent-sdk-python/pull/985) refactor(skills): consolidate Skill tools injection and harden tests | claude-code | proven | 2 PROVEN, 3 GUARD |
| [claude-agent-sdk-python #982](https://github.com/anthropics/claude-agent-sdk-python/pull/982) feat: add toolAliases support to Python SDK | claude-code | proven | 6 PROVEN |
| [llm #1698](https://github.com/simonw/llm/pull/1698) Fix crash when a non-streaming Chat Completions response has no usage | claude-code | proven | 1 PROVEN |
| [llm #1665](https://github.com/simonw/llm/pull/1665) Fix llm -- prompt not forwarding double-dash to prompt subcommand | claude-code | proven | 1 PROVEN |
| [llm #1632](https://github.com/simonw/llm/pull/1632) Include server-side tool call output in llm logs | claude-code | proven | 2 PROVEN |
| [llm #1613](https://github.com/simonw/llm/pull/1613) fix: set conversation_id from the conversation in --data-ids | cursor | proven | 1 PROVEN |
| [llm #1612](https://github.com/simonw/llm/pull/1612) fix: accept JSON Schema type names in schema_dsl | cursor | proven | 1 PROVEN |
| [llm #1585](https://github.com/simonw/llm/pull/1585) Enable service_tier option on all built-in OpenAI models | claude-code | proven | 2 PROVEN, 2 BROKEN |
| [llm #1566](https://github.com/simonw/llm/pull/1566) Removed duplicate documentation | claude-code | proven | 3 PROVEN |
| [llm #1539](https://github.com/simonw/llm/pull/1539) Deduplicate variable names in Template MissingVariables error | claude-code | proven | 1 PROVEN |
| [llm #1507](https://github.com/simonw/llm/pull/1507) Preserve streaming timings from OpenAI-compatible providers. | codex | proven | 1 PROVEN |
| [llm #1498](https://github.com/simonw/llm/pull/1498) Only register bundled OpenAI models when an OpenAI key is configured | claude-code | proven | 2 PROVEN |
| [llm #1495](https://github.com/simonw/llm/pull/1495) Make type=text the default for parts JSON | codex | proven | 9 PROVEN |
| [llm #1483](https://github.com/simonw/llm/pull/1483) Async tool calls to missing tools now produce error results | claude-code | proven | 3 PROVEN |
| [llm #1482](https://github.com/simonw/llm/pull/1482) Fix mypy union-attr errors in chain resume code | claude-code | mixed | 6 WEAK, 5 PROVEN, 3 GUARD |
| [llm #1481](https://github.com/simonw/llm/pull/1481) Ran black | claude-code | proven | 9 PROVEN, 2 GUARD |
| [llm #1480](https://github.com/simonw/llm/pull/1480) Ran Black | claude-code | proven | 5 PROVEN, 1 GUARD |
| [llm #1479](https://github.com/simonw/llm/pull/1479) Ran Black | claude-code | proven | 4 PROVEN |
| [llm #1468](https://github.com/simonw/llm/pull/1468) Fix extract_fenced_code_block for language tags with non-word characte | claude-code | proven | 1 PROVEN |
| [llm #1465](https://github.com/simonw/llm/pull/1465) Merge branch 'main' into codex/skip-broken-plugin-entrypoints | codex | weak | 2 WEAK |
| [llm #1400](https://github.com/simonw/llm/pull/1400) Fix embed_multi_with_metadata dedup to filter by content_hash, not id | claude-code | env | 1 BROKEN |
| [llm #1391](https://github.com/simonw/llm/pull/1391) fix: fall back to stdlib mimetypes when puremagic returns empty string | claude-code | proven | 2 PROVEN |
| [mcp-python-sdk #3568](https://github.com/modelcontextprotocol/python-sdk/pull/3568) fix(client/auth): tolerate comma-separated scope strings | claude-code | weak | 2 WEAK |
| [mcp-python-sdk #3567](https://github.com/modelcontextprotocol/python-sdk/pull/3567) fix(client/auth): preserve an authorization endpoint's existing query  | claude-code | proven | 1 PROVEN |
| [mcp-python-sdk #3479](https://github.com/modelcontextprotocol/python-sdk/pull/3479) Support meta on prompts, as tools and resources already do | claude-code | proven | 2 PROVEN, 1 GUARD |
| [mcp-python-sdk #3427](https://github.com/modelcontextprotocol/python-sdk/pull/3427) fix(client): re-raise transport exceptions in default message handler | cursor | proven | 2 PROVEN |
| [mcp-python-sdk #3402](https://github.com/modelcontextprotocol/python-sdk/pull/3402) Fail pending send_raw_request waiters when the read stream yields an e | claude-code | proven | 3 PROVEN |
| [mcp-python-sdk #3340](https://github.com/modelcontextprotocol/python-sdk/pull/3340) Give recursive tool output schemas an object root (#3337) | cursor | proven | 2 PROVEN |
| [mcp-python-sdk #3301](https://github.com/modelcontextprotocol/python-sdk/pull/3301) fix(mcpserver): ignore the return annotation when finding the context  | claude-code | proven | 2 GUARD, 5 PROVEN |
| [mcp-python-sdk #3296](https://github.com/modelcontextprotocol/python-sdk/pull/3296) README snippet check: give a mis-encoded source the same one-line erro | claude-code | proven | 34 GUARD, 1 PROVEN, 1 SKIPPED |
| [mcp-python-sdk #3278](https://github.com/modelcontextprotocol/python-sdk/pull/3278) docs: align the SSE notification-POST sentence with its streamable sib | claude-code | proven | 12 PROVEN |
| [mcp-python-sdk #3276](https://github.com/modelcontextprotocol/python-sdk/pull/3276) Merge branch 'main' into fix/streamable-http-401-unauthorized | cursor | proven | 2 PROVEN |
| [mcp-python-sdk #3264](https://github.com/modelcontextprotocol/python-sdk/pull/3264) test(client/auth): cover the 403 step-up's exception relay; drop its s | claude-code | weak | 14 WEAK |
| [mcp-python-sdk #3263](https://github.com/modelcontextprotocol/python-sdk/pull/3263) fix(client/auth): non-fatal SEP-2468 check on eager path; flag discove | claude-code | proven | 9 PROVEN, 1 GUARD |
| [mcp-python-sdk #3229](https://github.com/modelcontextprotocol/python-sdk/pull/3229) test(server): cover client disconnect during session establishment | claude-code | proven | 2 PROVEN, 9 GUARD |
| [mcp-python-sdk #3225](https://github.com/modelcontextprotocol/python-sdk/pull/3225) test(mcpserver): pin nested TypedDict and explicit-None omission behav | claude-code | proven | 5 PROVEN |
| [mcp-python-sdk #3155](https://github.com/modelcontextprotocol/python-sdk/pull/3155) Merge branch 'main' into structured-content-no-mirror-objects | claude-code | proven | 1 PROVEN |
| [mcp-python-sdk #3132](https://github.com/modelcontextprotocol/python-sdk/pull/3132) fix: stop newline translation corrupting stdio framing on Windows | claude-code | unproven | 1 THEATER |
| [mcp-python-sdk #3130](https://github.com/modelcontextprotocol/python-sdk/pull/3130) fix: include RFC 6750 scope parameter in insufficient_scope challenge | claude-code | env | error |
| [mcp-python-sdk #3118](https://github.com/modelcontextprotocol/python-sdk/pull/3118) fix(server): generate tool output schema in serialization mode | claude-code | proven | 3 PROVEN |
| [mcp-python-sdk #3104](https://github.com/modelcontextprotocol/python-sdk/pull/3104) fix(streamable-http): return spec-mandated 405 for pre-session GET | claude-code | proven | 2 PROVEN |
| [mcp-python-sdk #3101](https://github.com/modelcontextprotocol/python-sdk/pull/3101) Add Streamable HTTP request body limits | claude-code | env | error |
| [openai-agents-python #5142](https://github.com/openai/openai-agents-python/pull/5142) fix(core): restore nested agent tool state against the tool's own agen | claude-code | proven | 2 PROVEN |
| [openai-agents-python #5111](https://github.com/openai/openai-agents-python/pull/5111) Merge branch 'main' into fix/realtime-demo-local-boundary | copilot | env | 10 BROKEN |
| [openai-agents-python #5059](https://github.com/openai/openai-agents-python/pull/5059) fix(core): keep str(RunResult) working after release_agents plus GC | cursor | proven | 1 PROVEN |
| [openai-agents-python #5040](https://github.com/openai/openai-agents-python/pull/5040) fix(sandbox): correct four YAML edge cases in skill frontmatter | claude-code | proven | 15 PROVEN, 6 GUARD |
| [openai-agents-python #4918](https://github.com/openai/openai-agents-python/pull/4918) test(chatcmpl): narrow parsed tool call types | codex | proven | 2 PROVEN |
| [openai-agents-python #4893](https://github.com/openai/openai-agents-python/pull/4893) fix(sandbox): keep scripted create calls on their normalized paths | claude-code | weak | 4 SKIPPED, 13 WEAK |
| [openai-agents-python #4892](https://github.com/openai/openai-agents-python/pull/4892) fix(sandbox): apply the PTY token limit once, after draining exit outp | claude-code | weak | 5 WEAK, 3 SKIPPED |
| [openai-agents-python #4891](https://github.com/openai/openai-agents-python/pull/4891) style(sandbox): wrap the _open_regular_file docstring | claude-code | proven | 7 PROVEN, 1 SKIPPED |
| [openai-agents-python #4890](https://github.com/openai/openai-agents-python/pull/4890) fix: rename and compare entries descriptor-relative on UnixLocal | claude-code | mixed | 10 PROVEN, 5 GUARD, 9 WEAK, 3 SKIPPED, 1 BROKEN |
| [openai-agents-python #4873](https://github.com/openai/openai-agents-python/pull/4873) fix(memory): defer conversation page sizing | codex | proven | 1 PROVEN |
| [openai-agents-python #4863](https://github.com/openai/openai-agents-python/pull/4863) test(core): escape the **kwargs pattern in the decorator strict-mode t | claude-code | proven | 3 PROVEN |
| [openai-agents-python #4861](https://github.com/openai/openai-agents-python/pull/4861) fix(core): name the problem when a tool parameter is called model_conf | claude-code | proven | 1 PROVEN |
| [openai-agents-python #4834](https://github.com/openai/openai-agents-python/pull/4834) fix(sandbox): rebase links to the workspace root, leave trailing-separ | claude-code | env | 27 BROKEN, 9 SKIPPED |
| [openai-agents-python #4833](https://github.com/openai/openai-agents-python/pull/4833) fix(sandbox): recognize a noncanonical spelling of the workspace root  | claude-code | proven | 11 PROVEN, 3 GUARD |
| [openai-agents-python #4832](https://github.com/openai/openai-agents-python/pull/4832) fix(sandbox): compare the workspace root as POSIX text in the base ses | claude-code | proven | 2 PROVEN, 2 GUARD |
| [openai-agents-python #4831](https://github.com/openai/openai-agents-python/pull/4831) fix(sandbox): only rebase symlinks whose every component the snapshot  | claude-code | proven | 5 PROVEN |
| [openai-agents-python #4830](https://github.com/openai/openai-agents-python/pull/4830) fix(sandbox): resolve symlinked grant roots fully and let apply_patch  | claude-code | mixed | 7 GUARD, 1 SKIPPED, 8 PROVEN, 1 WEAK |
| [openai-agents-python #4825](https://github.com/openai/openai-agents-python/pull/4825) fix(voice): support cancellation on Python 3.10 | codex | env | 8 BROKEN |
| [openai-agents-python #4824](https://github.com/openai/openai-agents-python/pull/4824) fix(chat-completions): preserve passthrough stream behavior | claude-code | proven | 12 PROVEN, 3 GUARD |
| [openai-agents-python #4822](https://github.com/openai/openai-agents-python/pull/4822) fix(extensions): skip AdvancedSQLiteSession usage store when the branc | claude-code | env | 1 SKIPPED |
| [fastmcp #5263](https://github.com/PrefectHQ/fastmcp/pull/5263) search: keep _make_call_tool signature; document transform order | claude-code | proven | 6 PROVEN |
| [fastmcp #5262](https://github.com/PrefectHQ/fastmcp/pull/5262) tasks: keep task tools a catalog transform adds | claude-code | proven | 5 PROVEN, 1 GUARD |
| [fastmcp #5253](https://github.com/PrefectHQ/fastmcp/pull/5253) resources: share a wrapped template's pattern and honor _list_query_pa | claude-code | proven | 3 PROVEN, 2 GUARD |
| [fastmcp #5250](https://github.com/PrefectHQ/fastmcp/pull/5250) tests: guard completion against middleware side effects | claude-code | proven | 1 PROVEN, 1 GUARD |
| [fastmcp #5249](https://github.com/PrefectHQ/fastmcp/pull/5249) resources: treat a template read whose URI does not match its pattern  | claude-code | proven | 6 PROVEN, 5 GUARD |
| [fastmcp #5248](https://github.com/PrefectHQ/fastmcp/pull/5248) resources: keep every compiled template pattern cached | claude-code | proven | 1 PROVEN |
| [fastmcp #5245](https://github.com/PrefectHQ/fastmcp/pull/5245) resources: cache compiled URI template patterns | claude-code | proven | 1 PROVEN |
| [fastmcp #5244](https://github.com/PrefectHQ/fastmcp/pull/5244) completions: check reference visibility through typed list hooks only | claude-code | proven | 2 PROVEN |
| [fastmcp #5240](https://github.com/PrefectHQ/fastmcp/pull/5240) completions: answer only references the caller can list | claude-code | proven | 3 PROVEN, 1 GUARD |
| [fastmcp #5223](https://github.com/PrefectHQ/fastmcp/pull/5223) client: keep close() stopping the session in order under the lock | claude-code | proven | 3 GUARD, 1 FLAKY, 6 PROVEN |
| [fastmcp #5221](https://github.com/PrefectHQ/fastmcp/pull/5221) json-schema: tolerate counts larger than any real length | claude-code | proven | 2 PROVEN |
| [fastmcp #5220](https://github.com/PrefectHQ/fastmcp/pull/5220) search: render non-JSON schema defaults and enums in the markdown seri | claude-code | proven | 1 PROVEN |
| [fastmcp #5219](https://github.com/PrefectHQ/fastmcp/pull/5219) stdio: revert shared keep_alive=False sessions (#5180, #5215) | claude-code | proven | 1 PROVEN, 1 GUARD |
| [fastmcp #5218](https://github.com/PrefectHQ/fastmcp/pull/5218) resources: accept non-exploded list query params as comma-joined value | claude-code | mixed | 5 WEAK, 3 PROVEN, 1 GUARD |
| [fastmcp #5217](https://github.com/PrefectHQ/fastmcp/pull/5217) tools: keep null title overrides and mirror overrides on proxy tools | claude-code | proven | 4 PROVEN, 4 GUARD |
| [fastmcp #5216](https://github.com/PrefectHQ/fastmcp/pull/5216) resources: match template literals whether they arrive raw or percent- | claude-code | proven | 2 PROVEN |
| [fastmcp #5215](https://github.com/PrefectHQ/fastmcp/pull/5215) stdio: stop an unshared subprocess when its session exits under cancel | claude-code | proven | 1 PROVEN |
| [fastmcp #5214](https://github.com/PrefectHQ/fastmcp/pull/5214) json-schema: accept integral float counts like minLength 2.0 | claude-code | proven | 2 PROVEN |
| [fastmcp #5208](https://github.com/PrefectHQ/fastmcp/pull/5208) json-schema: cache the raw-string constraint wrapper per format and co | claude-code | proven | 1 PROVEN, 3 GUARD |
| [fastmcp #5206](https://github.com/PrefectHQ/fastmcp/pull/5206) Merge remote-tracking branch 'origin/main' into zzstoatzz/resource-que | claude-code | proven | 11 PROVEN, 18 GUARD |

## Changes no test proves

Every test these changes added or edited passes without the change.

- [claude-agent-sdk-python #1010](https://github.com/anthropics/claude-agent-sdk-python/pull/1010) fix: document /etc/hosts sandbox issue and add bwrapExtraBinds config (claude-code): `tests/test_transport.py::TestSubprocessCLITransport::test_sandbox_with_bwrap_extra_binds`
- [mcp-python-sdk #3132](https://github.com/modelcontextprotocol/python-sdk/pull/3132) fix: stop newline translation corrupting stdio framing on Windows (claude-code): `tests/server/test_stdio.py::test_stdio_server_default_stdout_writes_bare_lf`

## Changes proven only by tests of new code (WEAK)

- [claude-agent-sdk-python #1305](https://github.com/anthropics/claude-agent-sdk-python/pull/1305) fix: raise ControlRequestError (a ClaudeSDKError) for failed control requests (claude-code)
- [claude-agent-sdk-python #1103](https://github.com/anthropics/claude-agent-sdk-python/pull/1103) fix(query): only defer the stdin close for delegated agent tasks (claude-code)
- [claude-agent-sdk-python #1101](https://github.com/anthropics/claude-agent-sdk-python/pull/1101) fix(transport): address review feedback on oversized-prompt spill (claude-code)
- [claude-agent-sdk-python #1016](https://github.com/anthropics/claude-agent-sdk-python/pull/1016) fix: correct task_updated status vocabulary to match the CLI (claude-code)
- [llm #1465](https://github.com/simonw/llm/pull/1465) Merge branch 'main' into codex/skip-broken-plugin-entrypoints (codex)
- [mcp-python-sdk #3568](https://github.com/modelcontextprotocol/python-sdk/pull/3568) fix(client/auth): tolerate comma-separated scope strings (claude-code)
- [mcp-python-sdk #3264](https://github.com/modelcontextprotocol/python-sdk/pull/3264) test(client/auth): cover the 403 step-up's exception relay; drop its stale no-co (claude-code)
- [openai-agents-python #4893](https://github.com/openai/openai-agents-python/pull/4893) fix(sandbox): keep scripted create calls on their normalized paths (claude-code)
- [openai-agents-python #4892](https://github.com/openai/openai-agents-python/pull/4892) fix(sandbox): apply the PTY token limit once, after draining exit output (claude-code)

## Not judged

- [claude-agent-sdk-python #1014](https://github.com/anthropics/claude-agent-sdk-python/pull/1014) env: 8 SKIPPED
- [claude-agent-sdk-python #1008](https://github.com/anthropics/claude-agent-sdk-python/pull/1008) env: 1 BROKEN
- [llm #1400](https://github.com/simonw/llm/pull/1400) env: 1 BROKEN
- [mcp-python-sdk #3130](https://github.com/modelcontextprotocol/python-sdk/pull/3130) env: E   ModuleNotFoundError: No module named 'httpx'
- [mcp-python-sdk #3101](https://github.com/modelcontextprotocol/python-sdk/pull/3101) env: E   ModuleNotFoundError: No module named 'httpx'
- [openai-agents-python #5111](https://github.com/openai/openai-agents-python/pull/5111) env: 10 BROKEN
- [openai-agents-python #4834](https://github.com/openai/openai-agents-python/pull/4834) env: 27 BROKEN, 9 SKIPPED
- [openai-agents-python #4825](https://github.com/openai/openai-agents-python/pull/4825) env: 8 BROKEN
- [openai-agents-python #4822](https://github.com/openai/openai-agents-python/pull/4822) env: 1 SKIPPED
