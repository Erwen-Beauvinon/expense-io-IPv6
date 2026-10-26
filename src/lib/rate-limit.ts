// Limiteur anti-brute-force en mémoire (phase 8, audit) : fenêtre
// glissante par clé (action + seau). Les compteurs vivent dans le
// processus : suffisant pour une instance unique, à externaliser
// (Redis, base) dès le multi-instances. Un dépassement n'est jamais
// une erreur métier : le middleware répond 429 avec un message fixe,
// les Server Actions renvoient le message dans leur état (HTTP 200,
// le §5 du contrat ne prévoit 429 que pour les routes HTTP).
export interface LimiteurOptions {
  fenetreMs: number
  maxEssais: number
  maintenant?: () => number
}

export function creerLimiteur(options: LimiteurOptions) {
  const { fenetreMs, maxEssais, maintenant = () => Date.now() } = options
  const echecsParCle = new Map<string, number[]>()
  // Borne mémoire (revue phase/8 §4) : des valeurs aléatoires dans la
  // clé (en-tête forgée) ne font plus croître la Map sans limite —
  // balayage complet périodique des fenêtres expirées.
  const INTERVALLE_BALAYAGE_MS = 60_000
  let dernierBalayage = 0

  function purger(cle: string, instant: number): number[] {
    const passes = (echecsParCle.get(cle) ?? []).filter((t) => instant - t < fenetreMs)
    if (passes.length === 0) echecsParCle.delete(cle)
    else echecsParCle.set(cle, passes)
    return passes
  }

  function balayer(instant: number): void {
    if (instant - dernierBalayage < INTERVALLE_BALAYAGE_MS) return
    dernierBalayage = instant
    for (const [cle, instants] of echecsParCle) {
      const restants = instants.filter((t) => instant - t < fenetreMs)
      if (restants.length === 0) echecsParCle.delete(cle)
      else echecsParCle.set(cle, restants)
    }
  }

  return {
    // Lecture seule : ne compte rien. À tester AVANT la tentative.
    autorise(cle: string): boolean {
      const instant = maintenant()
      balayer(instant)
      return purger(cle, instant).length < maxEssais
    },
    // Échecs seuls (revue phase/8 §4) : un réseau partagé (campus) dont
    // les connexions réussissent n'épuise jamais le quota. À appeler
    // sur toute réponse d'échec (400, identifiants invalides).
    signalerEchec(cle: string): void {
      const instant = maintenant()
      balayer(instant)
      const passes = purger(cle, instant)
      passes.push(instant)
      echecsParCle.set(cle, passes)
    },
    // Exposé pour les tests uniquement.
    compter(cle: string): number {
      return purger(cle, maintenant()).length
    },
  }
}

export type Limiteur = ReturnType<typeof creerLimiteur>

// 10 échecs par tranche de 10 minutes, pour login et signup. Assez
// large pour un usage légitime (erreurs de frappe), assez étroit pour
// rendre le brute-force impraticable. Voir aussi le middleware
// (POST /api/auth/*) pour l'endpoint Auth.js direct.
export const limiteurAuth: Limiteur = creerLimiteur({
  fenetreMs: 10 * 60 * 1000,
  maxEssais: 10,
})

export const MESSAGE_TROP_DE_TENTATIVES =
  'Trop de tentatives, réessaie dans quelques minutes.'
