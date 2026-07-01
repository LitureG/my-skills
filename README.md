# my-skills

Personal Claude Code skills and knowledge configuration, managed via [cc-switch](https://ccswitch.io).

## Structure

```
skills/           # Custom skills — deployed by cc-switch
  ├── code-reader/
  ├── docx-editor-cn/
  ├── note/
  ├── paper-read/
  ├── paper-summary/
  ├── research-manager/
  ├── skill-evolution/
  └── todo/
memory/           # User knowledge profile
  ├── MEMORY.md
  └── user_knowledge/
      ├── subjects/   # Subject-level knowledge (L0-L3 + C1-C3 + timeliness)
      └── concepts/   # Cross-disciplinary concept definitions
```

## Usage

1. Add this repo to cc-switch as a custom source:
   - Owner: `LitureG`
   - Name: `my-skills`
   - Branch: `main`
   - Subdirectory: `skills`
2. Install individual skills from the cc-switch Skills panel.
