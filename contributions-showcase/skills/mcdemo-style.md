---
name: mcdemo-style
---

# MinCode Demo (.mcdemo) style guide

- Declare one `task` per unit of work and close every block with `end`.
- Use lower-case, hyphen-separated task names, for example `task build-ui`.
- Put settings (`key = value`) at the top of the file, before the first task.
- Quote every `run` command with double quotes; do not chain commands with `&&`.
- Prefer `when` / `else` over duplicated tasks, and keep nesting to two levels.
- Start comments with `#`, and explain *why* rather than *what*.
