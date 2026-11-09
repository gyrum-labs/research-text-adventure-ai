# The matrix

model                           cond  n      success (95% CI)  median turns  $/solve
------------------------------  ----  -----  ----------------  ------------  -------
claude sonnet 4.5 (openrouter)  A     10/10  0%  (0–28%)       23            -      
claude sonnet 4.5 (openrouter)  B     10/10  90%  (60–98%)     13            $0.3549
claude sonnet 4.5 (openrouter)  C     10/10  70%  (40–89%)     18            $0.1268
claude sonnet 4.5 (openrouter)  D     10/10  0%  (0–28%)       30            -      
claude sonnet 4.5 (openrouter)  E     10/10  80%  (49–94%)     13            $0.4541
glm 5.3 (z.ai)                  A     10/10  60%  (31–83%)     12            $0.1263
glm 5.3 (z.ai)                  B     10/10  80%  (49–94%)     13            $0.1330
glm 5.3 (z.ai)                  C     10/10  60%  (31–83%)     14            $0.0761
glm 5.3 (z.ai)                  D     10/10  0%  (0–28%)       26            -      
glm 5.3 (z.ai)                  E     10/10  60%  (31–83%)     13            $0.2480
gpt-4.1-mini (openrouter)       A     10/10  40%  (17–69%)     23            $0.0451
gpt-4.1-mini (openrouter)       B     10/10  50%  (24–76%)     23            $0.1386
gpt-4.1-mini (openrouter)       C     10/10  0%  (0–28%)       24            -      
gpt-4.1-mini (openrouter)       D     10/10  0%  (0–28%)       21            -      
gpt-4.1-mini (openrouter)       E     10/10  20%  (6–51%)      23            $0.3825
glm 4.5 air (z.ai)              A     10/10  0%  (0–28%)       25            -      
glm 4.5 air (z.ai)              B     10/10  20%  (6–51%)      28            $0.1456
glm 4.5 air (z.ai)              C     10/10  0%  (0–28%)       29            -      
glm 4.5 air (z.ai)              D     10/10  0%  (0–28%)       28            -      
glm 4.5 air (z.ai)              E     10/10  0%  (0–28%)       25            -      

## Failures

  F2  ████████████████████ 80
  F3  ██████ 23
  F4  █ 3
  F5  ██████ 23
  F7  ██ 8

cost per solved mission: $0.2868

## Hypotheses

  H1  FALSIFIED A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget
      The pooled success rate across every cell is 31.5%, including the no-history control, against a threshold of 80%.
  H2  FALSIFIED Masking the action space to legal commands raises the success rate
      The masked condition E succeeded on 40.0% of runs and the unmasked condition B on 60.0%. The two differ only in the masking.
  H3  SUPPORTED A structured observation beats prose for multi-step reasoning
      The JSON condition B succeeded on 60.0% of runs and the prose condition A on 25.0%. The two differ only in the rendering.
  H4  FALSIFIED Most failures are not parsing failures but reasoning/ordering failures
      80 of the 137 failures were malformed output and 57 were reasoning, ordering or planning failures.
  H5  FALSIFIED Full transcript history causes context dilution versus a structured memory summary
      The structured condition C succeeded on 32.5% of runs in 20.8 turns, the full-history condition E on 40.0% in 18.3 turns. The two differ only in the context strategy.
