# Run locally (Windows, macOS, Linux)

You need Node.js 20 or newer and a free PostgreSQL database (Neon: neon.tech -> create a project -> **Connect** -> turn on
**Show password** -> **Copy snippet**).

Open a terminal **in the project folder** (the folder that contains `backend` and `frontend`). In VS Code: File -> Open Folder, then
Terminal -> New Terminal.

```
npm run install:all     # installs backend and frontend packages (once)
npm run setup           # asks for your database link, writes backend/.env and frontend/.env, makes the secrets
npm run doctor          # checks everything and says what to fix
npm run dev             # starts backend (5000) and frontend (5173) together
```

Open http://localhost:5173, register, log in.

* Run `npm run setup` again at any time: it keeps your existing secrets and only updates what you type.
* Stop both servers with `Ctrl + C`.
* If port 5000 or 5173 is busy, `npm run dev` prints the command that frees it.
* Scans need the scanner repository (see `docs/SETUP.md`) and a public backend address. Deploy the backend on Vercel
  (`deploy/vercel/README.md`); a local backend cannot be reached by GitHub.
