# Third-party notices

AutumnApply is an independent project. Its initial architecture was informed by the following public repositories:

| Project | Repository | License | Initial use |
| --- | --- | --- | --- |
| OpenJobAutofill | https://github.com/Br1an67/OpenJobAutofill | MIT | Design reference for privacy-first form filling and human review |
| CareerWeaver | https://github.com/idea-torx/CareerWeaver | MIT | Design reference for fact-grounded resume tailoring |
| Offer Harvester | https://github.com/JiemsLBJ/offer-harvester | MIT | Design reference for a China-focused application workflow |
| czc-good-job | https://github.com/czc6666/czc-good-job | MIT | Design reference for a narrow platform adapter and local backend split |

The Tencent public-careers provider is adapted from `JiemsLBJ/offer-harvester` at commit `cd0086ea48786c0216e6a5905be613bcfa8471cd` under the MIT License:

```text
Copyright (c) 2026 Mads Lorentzen (upstream ai-job-search)
Copyright (c) 2026 JiemsLBJ (China-market automation pipeline)
```

The adapted browser module retains only public, read-only search and detail fetching. It does not include application automation, user profiles or tracking code from that project.

Before adding third-party source code, a contributor must:

1. verify the license at the exact revision being reused;
2. preserve all required copyright and license notices;
3. record the source repository and commit hash here;
4. describe substantial modifications; and
5. avoid copying code from repositories without an explicit license.
