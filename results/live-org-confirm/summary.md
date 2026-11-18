# The matrix

model                           cond  n      success (95% CI)  median turns  tok/solve  $/solve
------------------------------  ----  -----  ----------------  ------------  ---------  -------
claude sonnet 4.5 (openrouter)  D     10/10  0%  (0–28%)       28            -          -

## Failures

  F2  ████████████████████ 9
  F3  ██ 1

cost per solved mission: $0.0000

## Hypotheses

  H1  FALSIFIED A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget
      The pooled success rate across every cell is 0.0%, including the no-history control, against a threshold of 80%.
  H2  UNTESTED  Masking the action space to legal commands raises the success rate
      One of the two cells produced no runs.
  H3  UNTESTED  A structured observation beats prose for multi-step reasoning
      One of the two cells produced no runs.
  H4  FALSIFIED Most failures are not parsing failures but reasoning/ordering failures
      9 of the 10 failures were malformed output and 1 were reasoning, ordering or planning failures.
  H5  UNTESTED  Full transcript history causes context dilution versus a structured memory summary
      One of the two cells produced no runs.
