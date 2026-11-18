# The matrix

model                           cond  n      success (95% CI)  median turns  tok/solve  $/solve
------------------------------  ----  -----  ----------------  ------------  ---------  -------
claude sonnet 4.5 (openrouter)  A     30/30  100%  (89–100%)   15            29981      $0.1002
claude sonnet 4.5 (openrouter)  B     27/30  incomplete        24            418338     $1.3049
claude sonnet 4.5 (openrouter)  C     4/30   incomplete        14            72414      $0.2561
claude sonnet 4.5 (openrouter)  D     0/30   incomplete        -             -          -
claude sonnet 4.5 (openrouter)  E     0/30   incomplete        -             -          -
gpt-4.1-mini (openrouter)       A     0/30   incomplete        -             -          -
gpt-4.1-mini (openrouter)       B     0/30   incomplete        -             -          -
gpt-4.1-mini (openrouter)       C     0/30   incomplete        -             -          -
gpt-4.1-mini (openrouter)       D     0/30   incomplete        -             -          -
gpt-4.1-mini (openrouter)       E     0/30   incomplete        -             -          -
glm 4.5 air (openrouter)        A     0/30   incomplete        -             -          -
glm 4.5 air (openrouter)        B     1/30   incomplete        1             -          -
glm 4.5 air (openrouter)        C     0/30   incomplete        -             -          -
glm 4.5 air (openrouter)        D     0/30   incomplete        -             -          -
glm 4.5 air (openrouter)        E     0/30   incomplete        -             -          -

## Failures

  F1  ███ 2
  F2  ████████████████████ 13
  F5  ███ 2
  F7  ███ 2

cost per solved mission: $0.4400

## Hypotheses

  H1  FALSIFIED A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget
      The pooled success rate across every cell is 69.4%, including the no-history control, against a threshold of 80%.
  H2  UNTESTED  Masking the action space to legal commands raises the success rate
      One of the two cells produced no runs.
  H3  FALSIFIED A structured observation beats prose for multi-step reasoning
      The JSON condition B succeeded on 42.9% of runs and the prose condition A on 100.0%. The two differ only in the rendering.
  H4  FALSIFIED Most failures are not parsing failures but reasoning/ordering failures
      15 of the 19 failures were malformed output and 4 were reasoning, ordering or planning failures.
  H5  UNTESTED  Full transcript history causes context dilution versus a structured memory summary
      One of the two cells produced no runs.
