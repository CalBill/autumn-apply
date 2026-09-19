# Third-party notices

AutumnApply is an independent project. Its initial architecture was informed by the following public repositories:

| Project | Repository | License | Initial use |
| --- | --- | --- | --- |
| OpenJobAutofill | https://github.com/Br1an67/OpenJobAutofill | MIT | Design reference for privacy-first form filling and human review |
| CareerWeaver | https://github.com/idea-torx/CareerWeaver | MIT | Design reference for fact-grounded resume tailoring |
| Offer Harvester | https://github.com/JiemsLBJ/offer-harvester | MIT | Design reference for a China-focused application workflow |
| czc-good-job | https://github.com/czc6666/czc-good-job | MIT | Design reference for a narrow platform adapter and local backend split |

The Tencent public-careers provider and the official career-system provider shapes are adapted from `JiemsLBJ/offer-harvester` at commit `cd0086ea48786c0216e6a5905be613bcfa8471cd` under the MIT License. The latter records that its provider shapes were adapted from `career-ops` v1.32.0 under the MIT License:

```text
Copyright (c) 2026 Mads Lorentzen (upstream ai-job-search)
Copyright (c) 2026 JiemsLBJ (China-market automation pipeline)
Copyright (c) 2025 Caleb John & career-ops contributors
```

The adapted browser modules retain only public, read-only search and detail fetching for Tencent, Meituan, Feishu Jobs, Moka, Greenhouse, Lever and Ashby. They do not include application automation, user profiles, scoring, tracking, anti-bot identity spoofing or retry behavior from those projects. Moka response decryption uses the public key delivered in the public website response and was ported from Node crypto to the browser Web Crypto API.

Before adding third-party source code, a contributor must:

1. verify the license at the exact revision being reused;
2. preserve all required copyright and license notices;
3. record the source repository and commit hash here;
4. describe substantial modifications; and
5. avoid copying code from repositories without an explicit license.
