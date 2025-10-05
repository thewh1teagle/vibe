# Tasks: Integrate Faster-Whisper

**Input**: D- [x] T001- [x] T004 [P] Contract test for transcribe function in core/tests/test_transcribe.rs

-   [x] T005 [P] Integration test for faster-whisper transcription in core/tests/integration_test.rsnstall faster-whisper Python package and dependencies
-   [x] T002 Create Python environment setup script in scripts/setup_faster_whisper.py
-   [x] T003 [P] Update Cargo.toml to include subprocess dependencies for calling Pythongn documents from `/specs/001-application-to-use/`
        **Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)

```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have tests?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`

-   **[P]**: Can run in parallel (different files, no dependencies)
-   Include exact file paths in descriptions

## Path Conventions

-   **Single project**: `core/src/`, `desktop/src/` at repository root
-   Paths adjusted based on plan.md structure

## Phase 3.1: Setup

-   [x] T001 Install faster-whisper Python package and dependencies
-   [x] T002 Create Python environment setup script in scripts/setup_faster_whisper.py
-   [x] T003 [P] Update Cargo.toml to include subprocess dependencies for calling Python

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

-   [x] T004 [P] Contract test for transcribe function in core/tests/test_transcribe.rs
-   [x] T005 [P] Integration test for faster-whisper transcription in core/tests/integration_test.rs

## Phase 3.3: Core Implementation (ONLY after tests are failing)

-   [x] T006 Define AudioFile and TranscriptionResult structs in core/src/transcript.rs
-   [x] T007 Modify transcribe function in core/src/transcribe.rs to use subprocess call to faster-whisper
-   [x] T008 Add faster-whisper configuration options in core/src/config.rs
-   [x] T009 Update error handling in core/src/transcribe.rs for model loading failures

## Phase 3.4: Integration

-   [x] T010 Ensure GPU acceleration support in faster-whisper subprocess calls
-   [x] T011 Update desktop UI components to show faster-whisper option in desktop/src/components/ModelOptions.tsx

## Phase 3.5: Polish

-   [x] T012 [P] Performance test for 2x speed improvement in core/tests/performance_test.rs
-   [x] T013 [P] Update README.md with faster-whisper integration notes
-   [x] T014 Run quickstart.md validation manually

## Dependencies

-   Tests (T004-T005) before implementation (T006-T009)
-   T006 blocks T007
-   Implementation before integration (T010-T011)
-   Integration before polish (T012-T014)

## Parallel Example

```
# Launch T004-T005 together:
Task: "Contract test for transcribe function in core/tests/test_transcribe.rs"
Task: "Integration test for faster-whisper transcription in core/tests/integration_test.rs"
```

## Notes

-   [P] tasks = different files, no dependencies
-   Verify tests fail before implementing
-   Commit after each task
-   Avoid: vague tasks, same file conflicts

## Task Generation Rules

_Applied during main() execution_

1. **From Contracts**:
    - Each contract file → contract test task [P]
    - Each endpoint → implementation task
2. **From Data Model**:
    - Each entity → model creation task [P]
    - Relationships → service layer tasks
3. **From User Stories**:

    - Each story → integration test [P]
    - Quickstart scenarios → validation tasks

4. **Ordering**:
    - Setup → Tests → Models → Services → Endpoints → Polish
    - Dependencies block parallel execution

## Validation Checklist

_GATE: Checked by main() before returning_

-   [x] All contracts have corresponding tests
-   [x] All entities have model tasks
-   [x] All tests come before implementation
-   [x] Parallel tasks truly independent
-   [x] Each task specifies exact file path
-   [x] No task modifies same file as another [P] task
-   [x] Tasks align with constitution principles (offline-first, real-time processing, cross-platform support, GPU acceleration)
