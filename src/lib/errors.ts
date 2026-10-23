import {
  estErreurMetier,
  type ErreurMetier,
} from '@/domain/errors'

// Traducteur d'erreurs unique de la couche interface
// (docs/contrats-ports.md §7). Les messages publics reprennent les textes
// actuels ; aucun détail technique (stack, cause) ne quitte le serveur.
function statutErreurMetier(error: ErreurMetier): number {
  switch (error.code) {
    case 'DonneesInvalides':
      return 400
    case 'AccesRefuse':
      return 403
    case 'NoteIntrouvable':
      return 404
    case 'DejaTranchee':
    case 'ManagerIneligible':
    case 'CycleHierarchique':
      return 409
  }
}

export function respondErreurMetier(error: ErreurMetier): Response {
  // Pas de log ici (revue phase/1 §6) : les erreurs métier (4xx) sont
  // des réponses normales, seul respondError journalise (pannes 500).
  return Response.json({ error: error.message }, { status: statutErreurMetier(error) })
}

// Panne d'infrastructure ou erreur inattendue : 500 générique.
// Ni message technique (connexion, pilote, chemin) ni stack ne
// quittent le serveur : le détail reste dans les logs (phase 8,
// audit : « messages publics séparés des logs internes »).
export function respondError(error: unknown): Response {
  if (estErreurMetier(error)) return respondErreurMetier(error)
  console.error(error)
  return Response.json({ error: 'Erreur interne' }, { status: 500 })
}
