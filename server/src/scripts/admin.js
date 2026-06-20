import "dotenv/config"
import { getUserByEmail, setUserAdmin, listAdmins } from "../store.js"

/**
 * Management manual al rolului de admin — rulat pe SERVER, nu prin API. Astfel
 * niciun endpoint din rețea nu poate acorda admin (fără cale de escaladare).
 *
 *   npm run admin -- set <email> <on|off>   promovează / retrogradează un cont existent
 *   npm run admin -- list                    listează adminii
 */
const [cmd, ...args] = process.argv.slice(2)

async function main() {
  if (cmd === "list") {
    const admins = await listAdmins()
    if (admins.length === 0) console.log("Niciun admin.")
    else admins.forEach((a) => console.log(`#${a.id}  ${a.email}`))
    return
  }

  if (cmd === "set") {
    const [email, state] = args
    if (!email || (state !== "on" && state !== "off")) {
      console.error("Folosire: npm run admin -- set <email> <on|off>")
      process.exit(1)
    }
    const user = await getUserByEmail(String(email).trim().toLowerCase())
    if (!user) {
      console.error(`Nu există un cont cu emailul ${email}. (Contul trebuie să existe deja.)`)
      process.exit(1)
    }
    await setUserAdmin(user.id, state === "on")
    console.log(`${user.email} este acum ${state === "on" ? "ADMIN" : "utilizator normal"}.`)
    return
  }

  console.error("Comenzi: set <email> <on|off> | list")
  process.exit(1)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Eroare:", err.message)
    process.exit(1)
  })
