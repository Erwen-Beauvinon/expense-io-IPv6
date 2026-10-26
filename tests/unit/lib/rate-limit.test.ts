import { afterEach, describe, expect, it } from 'vitest'
import { creerLimiteur, ipCliente } from '@/lib/rate-limit'

describe('limiteur anti-brute-force', () => {
  it('autorise jusqu’au quota d’échecs puis refuse, par clé indépendante', () => {
    const limiteur = creerLimiteur({ fenetreMs: 60_000, maxEssais: 3 })
    const cle = 'login:compte:a@x.fr'
    expect(limiteur.autorise(cle)).toBe(true)
    limiteur.signalerEchec(cle)
    limiteur.signalerEchec(cle)
    expect(limiteur.autorise(cle)).toBe(true)
    limiteur.signalerEchec(cle)
    expect(limiteur.autorise(cle)).toBe(false)
    expect(limiteur.autorise('login:compte:b@x.fr')).toBe(true)
    expect(limiteur.autorise('login:ip:1.2.3.4')).toBe(true)
  })

  it('ne compte pas les lectures : autorise sans échec, sans limite', () => {
    const limiteur = creerLimiteur({ fenetreMs: 60_000, maxEssais: 1 })
    for (let i = 0; i < 10; i++) {
      expect(limiteur.autorise('k')).toBe(true)
    }
    expect(limiteur.compter('k')).toBe(0)
  })

  it('oublie les échecs sortis de la fenêtre', () => {
    let instant = 0
    const limiteur = creerLimiteur({
      fenetreMs: 1000,
      maxEssais: 1,
      maintenant: () => instant,
    })
    limiteur.signalerEchec('k')
    expect(limiteur.autorise('k')).toBe(false)
    instant = 1001
    expect(limiteur.autorise('k')).toBe(true)
  })

  it('signalerTentative compte aussi les succès (inscription)', () => {
    const limiteur = creerLimiteur({ fenetreMs: 60_000, maxEssais: 2 })
    limiteur.signalerTentative('signup:ip:inconnue')
    limiteur.signalerTentative('signup:ip:inconnue')
    expect(limiteur.autorise('signup:ip:inconnue')).toBe(false)
  })

  it('ne fuit pas de mémoire : balayage périodique des clés expirées', () => {
    let instant = 0
    const limiteur = creerLimiteur({
      fenetreMs: 1000,
      maxEssais: 10,
      maintenant: () => instant,
    })
    // Clés à en-tête forgée : sans balayage, la Map croît sans limite.
    for (let i = 0; i < 50; i++) {
      limiteur.signalerEchec(`login:ip:10.0.0.${i}`)
    }
    expect(limiteur.compter('login:ip:10.0.0.0')).toBe(1)
    instant = 61_000
    expect(limiteur.autorise('login:ip:10.0.0.49')).toBe(true)
    // Le balayage a purgé toutes les fenêtres expirées.
    expect(limiteur.compter('login:ip:10.0.0.0')).toBe(0)
    expect(limiteur.compter('login:ip:10.0.0.49')).toBe(0)
  })
})

describe('ipCliente (revue V2, point 3)', () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY
  })

  function entetes(valeurs: Record<string, string>): Headers {
    return new Headers(valeurs)
  }

  it('sans proxy de confiance, ignore les en-têtes forgeables', () => {
    expect(ipCliente(entetes({ 'x-forwarded-for': '1.2.3.4' }))).toBe('inconnue')
    expect(ipCliente(entetes({ 'x-real-ip': '1.2.3.4' }))).toBe('inconnue')
  })

  it('derrière un proxy de confiance, prend la dernière entrée, pas la première forgée', () => {
    process.env.TRUSTED_PROXY = 'true'
    expect(
      ipCliente(entetes({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7, 198.51.100.2' }))
    ).toBe('198.51.100.2')
    expect(ipCliente(entetes({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
    expect(ipCliente(entetes({}))).toBe('inconnue')
  })
})
