import { describe, expect, it } from 'vitest'
import {
  champsInscriptionValides,
  domaineDe,
  estDomainePublic,
  estEmailValide,
  LONGUEUR_MIN_MOT_DE_PASSE,
  nomEntrepriseDepuisDomaine,
  roleALInscription,
} from '@/domain/Inscription'

// Règles de l'inscription (I14, I15), sans base.
describe('champs d’inscription', () => {
  it.each(['demo@expense.io', 'a.b@sub.example.fr'])('email accepté : %s', (email) => {
    expect(estEmailValide(email)).toBe(true)
  })

  it.each(['', 'demo', 'demo@expense', 'de mo@expense.io'])('email refusé : "%s"', (email) => {
    expect(estEmailValide(email)).toBe(false)
  })

  it('nom non vide, email valide, mot de passe d’au moins 8 caractères', () => {
    const valides = { nom: 'Nadia', email: 'nadia@acme.io', motDePasse: 'x'.repeat(LONGUEUR_MIN_MOT_DE_PASSE) }
    expect(champsInscriptionValides(valides)).toBe(true)
    expect(champsInscriptionValides({ ...valides, nom: '   ' })).toBe(false)
    expect(champsInscriptionValides({ ...valides, nom: 42 })).toBe(false)
    expect(champsInscriptionValides({ ...valides, email: 'pas-un-email' })).toBe(false)
    expect(champsInscriptionValides({ ...valides, motDePasse: 'x'.repeat(LONGUEUR_MIN_MOT_DE_PASSE - 1) })).toBe(false)
  })
})

describe('domaines e-mail publics (revue V2, point 4)', () => {
  it.each(['gmail.com', 'GMAIL.com', 'orange.fr', 'free.fr', 'proton.me'])('refuse %s', (domaine) => {
    expect(estDomainePublic(domaine)).toBe(true)
  })

  it('accepte un domaine d’entreprise', () => {
    expect(estDomainePublic('acme.io')).toBe(false)
  })
})

describe('entreprise et rôle (I14, I15)', () => {
  it('le domaine est mis en minuscules, le nom d’entreprise en est le premier segment', () => {
    expect(domaineDe('Nadia@ACME.io')).toBe('acme.io')
    expect(nomEntrepriseDepuisDomaine('acme.io')).toBe('acme')
    expect(nomEntrepriseDepuisDomaine('expense.co.uk')).toBe('expense')
  })

  it('premier inscrit = RH, suivants = employés, jamais manager', () => {
    expect(roleALInscription(true)).toBe('hr_admin')
    expect(roleALInscription(false)).toBe('employee')
  })
})
