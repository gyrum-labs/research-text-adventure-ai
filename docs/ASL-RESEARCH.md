# ASL: the language the Quest engine family is written in

## What ASL is

ASL is the authoring language of the Quest engine family. A Quest game is an
**ASLX** file: XML whose elements are the game's own vocabulary, and whose
scripts are written in the engine's expression language.

The current file format opens like this, and the version number is not
decoration:

```xml
<asl version="600">
  <include ref="English.aslx" />
  <include ref="Core.aslx" />
  ...
</asl>
```

The two includes are the standard library: `English.aslx` holds the language
(verbs, adjectives, the response vocabulary), and `Core.aslx` holds the
engine's own commands. A game includes them and adds its own content.

**The version number gates behaviour.** Quest Viva (the current engine)
saves `600`; `410`, `530` and `580` exist. When a new engine release fixes
something that would change how an existing game plays, the fix only applies
to games whose version number is high enough, so a game written for Quest 5
still plays exactly as it did. The editor always saves the current version, so
opening an old game and saving it upgrades its behaviour, and an old copy is
worth keeping before that happens.

There is an older dialect too, from the QDK 4.1 toolchain, with a different
shape:

```quest
define game <>
	asl-version <410>
	start <room>
	command <on> {
		timeroff <tmr>
		msg <Timer off>
	}
end define
```

The modern XML form replaced it; both are still found in the wild.

## The model

| ASL | What it is | Quest's name for it |
|---|---|---|
| `<game>` | The game itself: name, id, version, description | game |
| `<object>` | Anything the world contains: a room, a thing, a character | object |
| `<type>` | A template other objects inherit from | type |
| `<command>` | A verb the player can use, with patterns and a script | command |
| `<function>` | A named script, with a declared result type | function |
| `<include>` | Another file: a library, or part of the game | library |
| `<attribute>` | A named value on an object | attribute |

Three things about the model matter for any comparison with ours.

**Objects are typed by inheritance, not by a schema.** A room is an object
that inherits a room type; a thing inherits an object type. Attributes are
free-form: `<testattr>Test attribute value</testattr>` defines an attribute
and its value, and scripts can read and write attributes at runtime. Quest
does not validate a game against a schema before running it; the editor and
the compiler complain, and the engine does what the script says.

**Verbs and commands are two tools.** A **verb** belongs to one object
(`ROTATE DIAL`, `SPEAK TO MARY`); its response is either a message or a
script, or it can require a second object (`ATTACK GOBLIN WITH KNIFE`). A
**command** is the general form: it matches anything the player types,
including a verb that takes no object (`JUMP`, `SING LOUDLY`). Quest Viva
already defines about thirty verbs, and the standard library adds the
responses that go with them.

**Commands are patterns plus scripts.** A command declares one or more
patterns (regular expressions with named argument slots) and a script that
runs when the pattern matches:

```xml
<command>
  <pattern>unlock #object# with #object#</pattern>
  <script><![CDATA[
    if (Unlock (object, object2)) {
      msg ("The vault door swings open.")
    }
  ]]></script>
</command>
```

The pattern's `#slots#` become the script's arguments. Where an argument is
an object, the engine resolves the words the player typed against the objects
currently in scope.

**Scope is the engine's answer to "what can the player see".** By default a
command's scope is everything the player can see in the room they are in,
plus everything they are carrying; anything else gets "I can't see that."
The engine keeps two questions apart: whether an object is **visible** (no
opaque thing stands between it and the player) and whether it is
**reachable** (nothing closed stands in the way, so the contents of a closed
container are visible but not reachable until it is opened). A command
pattern's `#object#` matches anything visible, which is not a promise that
the player can touch it; the built-in commands check reachability
separately, and so must a game's own.

Scope is computed from the world, for every viewer. There is no separate
perception layer, and no notion of "the agent has perceived this, the human
has not". A game can vary a command's scope (`inventory`, `notheld`, or a
script that changes with the room), but the default is one world, one
viewer.

## ASL and our DSL, side by side

| | Ours | ASL |
|---|---|---|
| Authoring | One TypeScript object per world: rooms, objects, doors, actions, goals | XML files: objects, types, commands, scripts |
| Commands | A verb table with argument roles, predicates and effects as data | A script per verb, with the rules written in code |
| Validation | Every adventure is validated against a schema at load; a broken fixture fails loudly | No schema; the engine runs what the script says |
| Determinism | A pure reducer and a hash chain: every state is fingerprinted against the last | Ordinary mutable state, no chain |
| Perception | An explicit boundary: the agent sees what it has perceived, the human sees the room | One scope model for every viewer |
| Reuse | A second world needs no kernel change, and the kernel is checked by a hash manifest | Types and libraries compose, by inheritance and includes |

The two are not rivals so much as answers to different questions. Ours is a
measuring instrument: it is built so that a run can be replayed and compared.
ASL is an authoring environment: it is built so that a person can write a
large game with inheritance, includes and dynamic attributes, and let the
engine's conventions (scopes, response vocabulary, turn-taking) do the work.

The cost of that difference is worth stating plainly: **a game in ASL is
larger than the same game in our DSL.** Our two worlds are a few hundred
lines of data each. A faithful ASL version of the first world would carry
the room objects, the thing objects, the aliases, the door objects, the
command patterns for every verb, and the scripts that implement `unlock`,
`read`, `cut` and `hint`, which in our DSL are data. The inheritance
mechanism offsets some of it, but only for structure the author chose to
factor out.

## Why this is in the Phase 8 notes

Phase 8 asks whether the agent's scores are a fact about the agent or about
our engine. Answering it needs a third engine, and the third engine's
authoring language is part of the answer, because the second half of the
comparison is authoring cost.

There is a tooling finding worth recording: **the maintained JavaScript
QuestKit does not read ASL.** Its compiler takes a YAML world format
(`location`, `object`, `exit`, `command` sections), and its engine consumes
the compiled data. ASL's compiler is the C# QuestCompiler in the upstream
repository, which is not a headless tool. So a QuestJS-family engine is
available and runnable in Node, but the *canonical* Quest authoring language
is not the one that engine consumes, and the path from ASL to a running game
runs through the editor or the C# toolchain.

That is not a complaint about either project. It is the shape of the
ecosystem, and it is exactly the kind of fact a comparison should record
rather than assume.

## References

- Quest Viva repository, `v6.0.4`: <https://github.com/textadventures/quest>
  - `site/src/content/docs/reference/asl-versions.md` (game file versions)
  - `site/src/content/docs/reference/elements.md` (the XML elements)
  - `site/src/content/docs/reference/functions/core.md` (the script functions)
  - `site/src/content/docs/howto/commands/scope.md` (how scope works)
  - `site/src/content/docs/howto/commands/verbs.md` (how commands work)
  - `examples/test.aslx`, `examples/timer.asl` (worked examples)
- QuestKit, the JavaScript Quest toolkit: <https://github.com/textadventures/questkit>
- Our own comparison notes: `docs/MAPS.md` (the worlds side by side),
  `docs/RESEARCH-CONTEXT.md` (why the series built its own kernel)
