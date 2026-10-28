import { afterEach, describe, expect, it } from 'vitest'
import { cleCallback, clesLimite, creerLimiteur, ipCliente } from '@/lib/rate-limit'

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

describe('clesLimite (revues croisées du 2026-10-28)', () => {
  it('IP inconnue : seul le seau par compte, aucun seau global partagé', () => {
    expect(clesLimite('login', 'Alice@Acme.io', 'inconnue')).toEqual([
      'login:compte:alice@acme.io',
    ])
    // Deux clients distincts sans IP connue ne partagent donc aucune
    // clé : les échecs de l'un ne peuvent pas bloquer l'autre.
    const a = clesLimite('login', 'a@acme.io', 'inconnue')
    const b = clesLimite('login', 'b@acme.io', 'inconnue')
    expect(a.filter((cle) => b.includes(cle))).toEqual([])
  })

  it('IP connue : seaux compte et IP', () => {
    expect(clesLimite('signup', 'a@acme.io', '198.51.100.2')).toEqual([
      'signup:compte:a@acme.io',
      'signup:ip:198.51.100.2',
    ])
  })

  it('email invalide : seau sans-compte, jamais de seau global', () => {
    expect(clesLimite('login', null, 'inconnue')).toEqual(['login:compte:sans-compte'])
  })

  it('callback direct : le seau partagé inconnue est conservé, lui seul', () => {
    // Contre-revues du 2026-10-28 : sans ce seau, l'endpoint Auth.js
    // direct n'a aucune limite quand l'IP est inconnue. Les clés des
    // Server Actions (ci-dessus) et du callback restent distinctes.
    expect(cleCallback('inconnue')).toBe('auth-callback:ip:inconnue')
    expect(cleCallback('198.51.100.2')).toBe('auth-callback:ip:198.51.100.2')
    const limiteur = creerLimiteur({ fenetreMs: 60_000, maxEssais: 2 })
    limiteur.signalerEchec(cleCallback('inconnue'))
    limiteur.signalerEchec(cleCallback('inconnue'))
    expect(limiteur.autorise(cleCallback('inconnue'))).toBe(false)
    expect(limiteur.autorise('login:compte:a@acme.io')).toBe(true)
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
