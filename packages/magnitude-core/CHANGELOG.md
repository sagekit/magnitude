# magnitude-core

## 0.3.0-beta.0

### Minor Changes

- [`265a2ab`](https://github.com/sagekit/magnitude/commit/265a2ab348ec916f6382d3ad1dfe572b55e33090) Thanks [@anerli](https://github.com/anerli)! - drop support for separated grounding to reduce dependency issues and simplify code

## 0.2.32

### Patch Changes

- [`b1ee0c2`](https://github.com/sagekit/magnitude/commit/b1ee0c225ee33ac22f96a8c1828d6101921e57fc) Thanks [@anerli](https://github.com/anerli)! - - new MCP server for interacting with browser with persistent sessions
  - fix innerHTML assignment bugs causing issues for cursor visual and data extraction on google sites
  - fix cursor visual not having fixed positioning when scrolling main document
  - fix screenshot not breaking out of retry loop on success

## 0.2.31

### Patch Changes

- [`e54e4e1`](https://github.com/magnitudedev/magnitude/commit/e54e4e10ab05b8de593ba97eedf89121a3235971) Thanks [@anerli](https://github.com/anerli)! - add anthropic version config option to vertex

## 0.2.30

### Patch Changes

- [`c99f62c`](https://github.com/magnitudedev/magnitude/commit/c99f62c644b550c2eee74a42f27a72707c56628f) Thanks [@anerli](https://github.com/anerli)! - make location optional in vertex-ai

## 0.2.29

### Patch Changes

- [`870d225`](https://github.com/magnitudedev/magnitude/commit/870d2257c21cef24b4c14938fc20ae23fb369a80) Thanks [@anerli](https://github.com/anerli)! - disable temp config in vertex for now, seems format does not align with expected

## 0.2.28

### Patch Changes

- [`aa3dadb`](https://github.com/magnitudedev/magnitude/commit/aa3dadb9b4662d610809191b84aa59cb017981f6) Thanks [@anerli](https://github.com/anerli)! - throw on failure to get conn observations - prevents potential infinite wait loop if browser closed

## 0.2.27

### Patch Changes

- [`caf39dc`](https://github.com/magnitudedev/magnitude/commit/caf39dcaa9d7715f7b950251abaedecf728bf707) Thanks [@anerli](https://github.com/anerli)! - fix agent hang after stop by cleaning up webharness interval

## 0.2.26

### Patch Changes

- [`f1ae52e`](https://github.com/magnitudedev/magnitude/commit/f1ae52e7e812434d1b4a5468d0797ca13237d056) Thanks [@anerli](https://github.com/anerli)! - retry get full page content in extract

## 0.2.25

### Patch Changes

- [`6392151`](https://github.com/magnitudedev/magnitude/commit/6392151921b5f9544441fe9f8acb1d45de165c3d) Thanks [@anerli](https://github.com/anerli)! - option to disable virtual screen space transform on each harness op

## 0.2.24

### Patch Changes

- [`5703f04`](https://github.com/magnitudedev/magnitude/commit/5703f0454378197268cdb95d382f0bf8859cd0b3) Thanks [@anerli](https://github.com/anerli)! - improve tab tracking, make page tracking work for general interactions

## 0.2.23

### Patch Changes

- [`0159e6a`](https://github.com/magnitudedev/magnitude/commit/0159e6a3fe4c0186ae115cb0f8d52d55d10d1064) Thanks [@anerli](https://github.com/anerli)! - update baml to 202, memory options

## 0.2.22

### Patch Changes

- [`2ed36d2`](https://github.com/magnitudedev/magnitude/commit/2ed36d29307dbecaec839fedb1f9c853cd1045d4) Thanks [@ka-brian](https://github.com/ka-brian)! - fix: remove dep on 'open' package causing cjs problems

## 0.2.21

### Patch Changes

- [`d48d4ea`](https://github.com/magnitudedev/magnitude/commit/d48d4ea312509ae2953f915055d0df338864cbc8) Thanks [@anerli](https://github.com/anerli)! - swap rebrowser-patches for patchright

- [`09193a0`](https://github.com/magnitudedev/magnitude/commit/09193a0a1d6b87e091cfd58b17104da837f5a6c6) Thanks [@anerli](https://github.com/anerli)! - enable setting different llms for different purposes (act, extract, query)

## 0.2.20

### Patch Changes

- [`6e90614`](https://github.com/magnitudedev/magnitude/commit/6e906148a8c467bbca14a23da99867a88a6e72ce) Thanks [@anerli](https://github.com/anerli)! - add retries for when no actions returned or other weird llm provider errors

- [`797a94b`](https://github.com/magnitudedev/magnitude/commit/797a94b07684397b6ef6b8fa8122980841436b43) Thanks [@anerli](https://github.com/anerli)! - fix cost computation bug for cached input tokens By @Naqu6

## 0.2.19

### Patch Changes

- [#78](https://github.com/magnitudedev/magnitude/pull/78) [`5d61247`](https://github.com/magnitudedev/magnitude/commit/5d612477c25a83aa8b09808130fb1728246c44a6) Thanks [@anerli](https://github.com/anerli)! - prompt caching for ~40%+ less cost with claude

## 0.2.18

### Patch Changes

- [`5c63903`](https://github.com/magnitudedev/magnitude/commit/5c6390364602bad88a799978eb206dd7abe5e5ae) Thanks [@anerli](https://github.com/anerli)! - default thought limit in memory, option for screenshot limit

## 0.2.17

### Patch Changes

- [`b336af5`](https://github.com/magnitudedev/magnitude/commit/b336af50d79ab79b0fea0be7c62b6a1d4368c746) Thanks [@anerli](https://github.com/anerli)! - use default pages and contexts, vp fallback

## 0.2.16

### Patch Changes

- wait action, instruct no empty actions, workaround baml role bug

## 0.2.14

### Patch Changes

- extract v2 - dom cleaning and markdown conversion pipeline
- Updated dependencies
  - magnitude-extract@0.0.2

## 0.2.13

### Patch Changes

- claude code pro max support

## 0.2.12

### Patch Changes

- change nav icon

## 0.2.11

### Patch Changes

- fix image sharp get dimensions bug

## 0.2.9

### Patch Changes

- fix screenshot flash, fix sharp rounding err crash

## 0.2.8

### Patch Changes

- add select option keyboard search

## 0.2.7

### Patch Changes

- narrate mode, auto pipe to pino pretty, disable logging by default for core, fix playground env, pretty action output in test runner

## 0.2.6

### Patch Changes

- impl drag, double click, right click actions

## 0.2.5

### Patch Changes

- impl nav

## 0.2.4

### Patch Changes

- better keyboard control, fix crash on trusted html

## 0.2.3

### Patch Changes

- fix coord issues due to dpr, unify browser options interface

## 0.2.2

### Patch Changes

- fix check missing obs

## 0.2.1

### Patch Changes

- rm logs

## 0.2.0

### Patch Changes

- mono model

## 0.1.4

### Patch Changes

- moondream 524 retry

## 0.1.3

### Patch Changes

- native inputs, hierarchical url config, fixes

## 0.1.2

### Patch Changes

- tab switching, rate limit handling, fixes

## 0.1.1

### Patch Changes

- better deno compat, show costs, retries

## 0.1.0

### Minor Changes

- playwright interop

## 0.0.14

### Patch Changes

- update baml to fix bedrock issues

## 0.0.13

### Patch Changes

- fix check eval

## 0.0.12

### Patch Changes

- enable passing headers to openai generic client

## 0.0.11

### Patch Changes

- azure, fix bugs

## 0.0.10

### Patch Changes

- support google ai studio provider

## 0.0.9

### Patch Changes

- overhaul for self host

## 0.0.8

### Patch Changes

- update baml, fix dual export

## 0.0.7

### Patch Changes

- improved check conversions, failure classification

## 0.0.6

### Patch Changes

- scroll and cli improvements

## 0.0.5

### Patch Changes

- Fix import issue

## 0.0.4

### Patch Changes

- Fix dep versioning

## 0.0.3

### Patch Changes

- Remote and local running
