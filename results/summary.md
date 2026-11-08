# The matrix

model                     cond  n      success (95% CI)  median turns  tok/solve  $/solve
------------------------  ----  -----  ----------------  ------------  ---------  -------
surrogate (frontier)      A     10/10  100%  (72–100%)   10            8720       -      
surrogate (frontier)      B     10/10  100%  (72–100%)   10            23007      -      
surrogate (frontier)      C     10/10  100%  (72–100%)   10            8944       -      
surrogate (frontier)      D     10/10  0%  (0–28%)       8             -          -      
surrogate (frontier)      E     10/10  100%  (72–100%)   10            23007      -      
surrogate (strong)        A     10/10  70%  (40–89%)     10            15560      -      
surrogate (strong)        B     10/10  70%  (40–89%)     10            31743      -      
surrogate (strong)        C     10/10  70%  (40–89%)     10            15188      -      
surrogate (strong)        D     10/10  0%  (0–28%)       8             -          -      
surrogate (strong)        E     10/10  70%  (40–89%)     10            31743      -      
surrogate (mid)           A     10/10  60%  (31–83%)     10            20175      -      
surrogate (mid)           B     10/10  60%  (31–83%)     10            37028      -      
surrogate (mid)           C     10/10  60%  (31–83%)     10            19292      -      
surrogate (mid)           D     10/10  0%  (0–28%)       8             -          -      
surrogate (mid)           E     10/10  60%  (31–83%)     10            37028      -      
surrogate (open weights)  A     10/10  20%  (6–51%)      9             55462      -      
surrogate (open weights)  B     10/10  20%  (6–51%)      9             95479      -      
surrogate (open weights)  C     10/10  20%  (6–51%)      9             53906      -      
surrogate (open weights)  D     10/10  0%  (0–28%)       8             -          -      
surrogate (open weights)  E     10/10  20%  (6–51%)      9             95479      -      

## Failures

  F2  █████████ 32
  F6  ████████████████████ 68

cost per solved mission: $0.0000

## Hypotheses

  H1  FALSIFIED A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget
      The pooled success rate across every cell is 50.0%, including the no-history control, against a threshold of 80%.
  H2  FALSIFIED Masking the action space to legal commands raises the success rate
      The masked condition E succeeded on 62.5% of runs and the unmasked condition B on 62.5%. The two differ only in the masking.
  H3  FALSIFIED A structured observation beats prose for multi-step reasoning
      The JSON condition B succeeded on 62.5% of runs and the prose condition A on 62.5%. The two differ only in the rendering.
  H4  SUPPORTED Most failures are not parsing failures but reasoning/ordering failures
      32 of the 100 failures were malformed output and 68 were reasoning, ordering or planning failures.
  H5  FALSIFIED Full transcript history causes context dilution versus a structured memory summary
      The structured condition C succeeded on 62.5% of runs in 9.8 turns, the full-history condition E on 62.5% in 9.8 turns. The two differ only in the context strategy.
