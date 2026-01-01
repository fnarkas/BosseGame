# Claude Preferences for This Project

## Development Server

**DO NOT run `npm run dev` or start the Vite server automatically.**

The user will run the development server themselves.

- You can still read Vite logs when the user runs it
- You can suggest commands, but don't execute them
- Focus on code changes, not server management

## Reason

Running the server automatically is confusing because:
- The user is already using other projects on various ports
- It creates background processes that need to be managed
- The user prefers to control when the server runs
