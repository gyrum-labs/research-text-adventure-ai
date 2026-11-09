# The matrix

model                           cond  n      success (95% CI)  median turns  $/solve
------------------------------  ----  -----  ----------------  ------------  -------
claude sonnet 4.5 (openrouter)  A     10/10  0%  (0–28%)       15            -      
claude sonnet 4.5 (openrouter)  B     10/10  0%  (0–28%)       4             -      
claude sonnet 4.5 (openrouter)  C     10/10  0%  (0–28%)       4             -      
claude sonnet 4.5 (openrouter)  D     10/10  0%  (0–28%)       4             -      
claude sonnet 4.5 (openrouter)  E     10/10  0%  (0–28%)       4             -      
glm 5.3 (z.ai)                  A     10/10  10%  (2–40%)      13            $0.2697
glm 5.3 (z.ai)                  B     10/10  0%  (0–28%)       4             -      
glm 5.3 (z.ai)                  C     10/10  10%  (2–40%)      5             $0.1907
glm 5.3 (z.ai)                  D     10/10  0%  (0–28%)       4             -      
glm 5.3 (z.ai)                  E     10/10  0%  (0–28%)       4             -      
gpt-4.1-mini (openrouter)       A     10/10  10%  (2–40%)      11            $0.0547
gpt-4.1-mini (openrouter)       B     10/10  0%  (0–28%)       9             -      
gpt-4.1-mini (openrouter)       C     10/10  0%  (0–28%)       9             -      
gpt-4.1-mini (openrouter)       D     10/10  0%  (0–28%)       6             -      
gpt-4.1-mini (openrouter)       E     10/10  0%  (0–28%)       9             -      
glm 4.5 air (z.ai)              A     10/10  10%  (2–40%)      2             $0.0142
glm 4.5 air (z.ai)              B     10/10  0%  (0–28%)       5             -      
glm 4.5 air (z.ai)              C     10/10  0%  (0–28%)       5             -      
glm 4.5 air (z.ai)              D     10/10  0%  (0–28%)       4             -      
glm 4.5 air (z.ai)              E     10/10  0%  (0–28%)       7             -      

## Failures

  F2  ████ 30
  F3   3
  F5  ████████████████████ 155
  F7  █ 8

cost per solved mission: $0.6239

## Hypotheses

  H1  FALSIFIED A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget
      The pooled success rate across every cell is 2.0%, including the no-history control, against a threshold of 80%.
  H2  FALSIFIED Masking the action space to legal commands raises the success rate
      The masked condition E succeeded on 0.0% of runs and the unmasked condition B on 0.0%. The two differ only in the masking.
  H3  FALSIFIED A structured observation beats prose for multi-step reasoning
      The JSON condition B succeeded on 0.0% of runs and the prose condition A on 7.5%. The two differ only in the rendering.
  H4  SUPPORTED Most failures are not parsing failures but reasoning/ordering failures
      30 of the 196 failures were malformed output and 166 were reasoning, ordering or planning failures.
  H5  SUPPORTED Full transcript history causes context dilution versus a structured memory summary
      The structured condition C succeeded on 2.5% of runs in 5.6 turns, the full-history condition E on 0.0% in 6.0 turns. The two differ only in the context strategy.
