export interface ReceiptStoragePort {
  upload(key: string, body: Buffer, contentType: string): Promise<void>
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>
  // Compensation I4 (phase 5) : supprime un reçu dont la note n'a
  // finalement pas été créée. Un échec est journalisé, jamais masqué
  // en succès.
  supprimer(key: string): Promise<void>
}
