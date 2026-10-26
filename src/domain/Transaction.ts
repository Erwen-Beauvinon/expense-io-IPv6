// Poignée de transaction opaque (docs/contrats-ports.md §5) : seuls
// les repositories savent l'utiliser. Aucun accès SQL, aucun commit
// ni rollback n'en sort ; l'UnitOfWork en est le seul propriétaire.
export interface Transaction {
  readonly _marque: unique symbol
}
