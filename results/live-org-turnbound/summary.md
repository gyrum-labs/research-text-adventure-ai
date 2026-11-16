# The matrix

model                           cond  n      success (95% CI)  median turns  tok/solve  $/solve
------------------------------  ----  -----  ----------------  ------------  ---------  -------
claude sonnet 4.5 (openrouter)  A     20/20  50%  (30–70%)     20            111104     $0.3643
claude sonnet 4.5 (openrouter)  B     20/20  20%  (8–42%)      23            897225     $2.7965
claude sonnet 4.5 (openrouter)  C     20/20  20%  (8–42%)      22            159121     $0.5625
claude sonnet 4.5 (openrouter)  D     20/20  0%  (0–16%)       29            -          -
claude sonnet 4.5 (openrouter)  E     20/20  20%  (8–42%)      20            762771     $2.3836
gpt-4.1-mini (openrouter)       A     20/20  45%  (26–66%)     20            111023     $0.0477
gpt-4.1-mini (openrouter)       B     20/20  10%  (3–30%)      24            1999160    $0.8222
gpt-4.1-mini (openrouter)       C     20/20  0%  (0–16%)       23            -          -
gpt-4.1-mini (openrouter)       D     20/20  0%  (0–16%)       25            -          -
gpt-4.1-mini (openrouter)       E     20/20  0%  (0–16%)       24            -          -
glm 4.5 air (openrouter)        A     20/20  45%  (26–66%)     23            137828     -
glm 4.5 air (openrouter)        B     20/20  0%  (0–16%)       25            -          -
glm 4.5 air (openrouter)        C     20/20  5%  (1–24%)       28            874675     -
glm 4.5 air (openrouter)        D     20/20  0%  (0–16%)       28            -          -
glm 4.5 air (openrouter)        E     20/20  0%  (0–16%)       25            -          -

## Failures

  F1   3
  F2  ████████████████████ 171
  F3  █████ 39
  F4   2
  F5  █ 11
  F7  ████ 31

cost per solved mission: $0.7690

## Hypotheses

  H1  FALSIFIED A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget
      The pooled success rate across every cell is 14.3%, including the no-history control, against a threshold of 80%.
  H2  FALSIFIED Masking the action space to legal commands raises the success rate
      The masked condition E succeeded on 6.7% of runs and the unmasked condition B on 10.0%. The two differ only in the masking.
  H3  FALSIFIED A structured observation beats prose for multi-step reasoning
      The JSON condition B succeeded on 10.0% of runs and the prose condition A on 46.7%. The two differ only in the rendering.
  H4  FALSIFIED Most failures are not parsing failures but reasoning/ordering failures
      174 of the 257 failures were malformed output and 83 were reasoning, ordering or planning failures.
  H5  FALSIFIED Full transcript history causes context dilution versus a structured memory summary
      The structured condition C succeeded on 8.3% of runs in 23.8 turns, the full-history condition E on 6.7% in 22.7 turns. The two differ only in the context strategy.
