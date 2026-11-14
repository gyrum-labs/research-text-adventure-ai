# The engine comparison

The same agent, prompt, budgets and seeds, on a world whose rules live in QuestKit.

```
model                cond  n      solved  median turns  parse errors
live-frontier       A     10     10     15            0
live-frontier       B     10     0      11            0
live-frontier       C     10     10     15            0
live-frontier       D     10     0      28            0
live-frontier       E     10     0      11            0
live-mid            A     10     0      16            1
live-mid            B     10     0      12            2
live-mid            C     10     0      21            4
live-mid            D     10     0      30            0
live-mid            E     10     0      12            1
live-open           A     10     0      15            5
live-open           B     10     0      11            3
live-open           C     10     0      19            5
live-open           D     10     0      25            13
live-open           E     10     0      11            5
```

Solved 20 of 150 runs on the QuestKit engine.

Failure histogram:

- F3: 104
- F7: 26
