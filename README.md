# CodeArts Skills

Custom skills for the [CodeArts](https://www.huaweicloud.com/intl/en-us/product/codearts.html) coding assistant.

## Skills

### superpowers-codearts-installer

Install, update, or uninstall the [Superpowers](https://github.com/obra/superpowers) skills framework for CodeArts.

```bash
node skills/superpowers-codearts-installer/scripts/installer.js init    [--project|--user]
node skills/superpowers-codearts-installer/scripts/installer.js update  [--project|--user]
node skills/superpowers-codearts-installer/scripts/installer.js delete  [--project|--user]
```

**Requirements:** Node.js and git (both already required by CodeArts). Works on Windows, Linux, and macOS.

| Command | Description |
|---------|-------------|
| `init` | Clone Superpowers and install all 14 skill directories |
| `update` | Pull latest Superpowers and overwrite existing skills |
| `delete` | Cleanly remove all installed Superpowers files |

**Target selection:**

| Flag | Scope | Skills Path |
|------|-------|-------------|
| `--project` | Single project | `<project>/.codeartsdoer/skills/` |
| `--user` | All projects | `~/.codeartsdoer/skills/` |
| _(omit)_ | Auto-detect | Project if `.codeartsdoer/` exists in cwd, else user |

After installation, restart CodeArts and the Superpowers skills will be available.

## License

MIT