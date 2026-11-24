# Command Execution

Read before running a check, a long command, a background process, or a command the client settings exempt from the sandbox.

- Run checks and long commands so that only their outcome enters the context: keep their full output in a file under `.temp/`, except for a sandbox-exempt command, or in the log a repository script writes, read its summary and the failing part, and prefer a repository script or a check that prints one line per result.
- Run a command the client settings exempt from the sandbox alone, in the exact form its exemption declares, never redirected, piped, chained, or prefixed, because any other form can confine it.
- Treat a sandbox-exempt command as blocked only after running it that way, reading its output from the background task's output or from its script's log.
- Start a background process, such as a server, a log follower, a watcher, or a wait loop, only with a timeout or a stop the task controls, bound every wait with a time limit, and stop every one you started before reporting, above all any that cannot end on its own.
- A command the environment blocked never ran: name the restriction and the coverage it left open, and propose a durable sandbox exemption instead of working around it.
