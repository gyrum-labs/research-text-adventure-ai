# The matrix

model                           cond  n      success (95% CI)  median turns  tok/solve  $/solve
------------------------------  ----  -----  ----------------  ------------  ---------  -------
claude sonnet 4.5 (openrouter)  A     10/10  0%  (0–28%)       24            -          -
claude sonnet 4.5 (openrouter)  B     10/10  0%  (0–28%)       21            -          -
claude sonnet 4.5 (openrouter)  C     10/10  0%  (0–28%)       21            -          -
claude sonnet 4.5 (openrouter)  D     10/10  0%  (0–28%)       29            -          -
claude sonnet 4.5 (openrouter)  E     10/10  0%  (0–28%)       18            -          -
glm 5.3 (z.ai)                  A     0/10   incomplete        -             -          -
glm 5.3 (z.ai)                  B     0/10   incomplete        -             -          -
glm 5.3 (z.ai)                  C     0/10   incomplete        -             -          -
glm 5.3 (z.ai)                  D     0/10   incomplete        -             -          -
glm 5.3 (z.ai)                  E     0/10   incomplete        -             -          -
gpt-4.1-mini (openrouter)       A     10/10  0%  (0–28%)       27            -          -
gpt-4.1-mini (openrouter)       B     10/10  0%  (0–28%)       24            -          -
gpt-4.1-mini (openrouter)       C     10/10  0%  (0–28%)       23            -          -
gpt-4.1-mini (openrouter)       D     10/10  0%  (0–28%)       26            -          -
gpt-4.1-mini (openrouter)       E     10/10  0%  (0–28%)       24            -          -
glm 4.5 air (openrouter)        A     10/10  0%  (0–28%)       28            -          -
glm 4.5 air (openrouter)        B     10/10  0%  (0–28%)       27            -          -
glm 4.5 air (openrouter)        C     10/10  0%  (0–28%)       29            -          -
glm 4.5 air (openrouter)        D     10/10  0%  (0–28%)       29            -          -
glm 4.5 air (openrouter)        E     10/10  0%  (0–28%)       26            -          -

## Failures

  F2  ████████████████████ 88
  F3  ████████ 33
  F4   2
  F5  █ 4
  F7  █████ 23

cost per solved mission: $0.0000

## Hypotheses

  H1  FALSIFIED A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget
      The pooled success rate across every cell is 0.0%, including the no-history control, against a threshold of 80%.
  H2  FALSIFIED Masking the action space to legal commands raises the success rate
      The masked condition E succeeded on 0.0% of runs and the unmasked condition B on 0.0%. The two differ only in the masking.
  H3  FALSIFIED A structured observation beats prose for multi-step reasoning
      The JSON condition B succeeded on 0.0% of runs and the prose condition A on 0.0%. The two differ only in the rendering.
  H4  FALSIFIED Most failures are not parsing failures but reasoning/ordering failures
      88 of the 150 failures were malformed output and 62 were reasoning, ordering or planning failures.
  H5  FALSIFIED Full transcript history causes context dilution versus a structured memory summary
      The structured condition C succeeded on 0.0% of runs in 24.2 turns, the full-history condition E on 0.0% in 22.5 turns. The two differ only in the context strategy.
