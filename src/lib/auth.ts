import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { getPool } from '@/lib/db'

// Le secret JWT ne doit jamais être versionné : il est lu depuis
// l'environnement et son absence bloque le démarrage, avec un message
// explicite plutôt qu'une session signée par une valeur par défaut.
// Échec fermé (revues phase/1) : la valeur d'exemple `changeme-…`
// (copiée par `make env` si inchangée) et les valeurs trop courtes
// sont refusées — un secret public permet la forge de session.
const AUTH_SECRET = process.env.AUTH_SECRET
if (!AUTH_SECRET) {
  throw new Error(
    "AUTH_SECRET is not set. Génère-le (`npx auth secret`) ou lance `make env`."
  )
}
if (AUTH_SECRET.startsWith('changeme') || AUTH_SECRET.length < 32) {
  throw new Error(
    'AUTH_SECRET refusé (valeur d’exemple ou moins de 32 caractères) : ' +
      'il permettrait la forge de session. Génère-le (`npx auth secret`).'
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : null
        const password =
          typeof credentials?.password === 'string' ? credentials.password : null
        if (!email || !password) return null

        const result = await getPool().query<{
          id: string
          email: string
          password_hash: string
          role: 'employee' | 'manager' | 'hr_admin'
        }>('SELECT id, email, password_hash, role FROM users WHERE email = $1', [email])
        const user = result.rows[0]
        if (!user) return null

        const passwordMatches = await bcrypt.compare(password, user.password_hash)
        if (!passwordMatches) return null

        return { id: user.id, email: user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as 'employee' | 'manager' | 'hr_admin'
      }
      return session
    },
  },
})
