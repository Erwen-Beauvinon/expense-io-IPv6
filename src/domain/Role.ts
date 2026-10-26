// Rôles applicatifs (contrats des ports §2). Seul le type subsiste de
// l'ancienne entité `User`, retirée : ses règles (manager direct seul)
// contredisaient ADR-ARCH-002 et n'étaient appelées nulle part. Les règles
// hiérarchiques vivent dans `PolitiqueAcces`.
export type UserRole = 'employee' | 'manager' | 'hr_admin'
