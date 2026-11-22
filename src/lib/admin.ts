// BEHEERDER (22-11-2026). Joost: "zet de tactics pagina link bij settings maar alleen voor mij als admin
// zichtbaar". De app kende nog geen beheerdersrol; de eenvoudigste vaste herkenning is het Supabase-account
// waarmee hij is ingelogd. Een user-id en geen e-mailadres, zodat er geen adres in de publieke bundel staat.
//
// Let op: dit VERBERGT alleen knoppen. Het is geen beveiliging; wat achter zo'n knop zit (de tactiekpagina
// en zijn JSON) is gewoon openbaar en mag dat ook zijn.
const BEHEERDERS = new Set<string>([
  '709ed0c6-41a7-4cb8-ad19-5fea41be8cbf', // Joost (productie-project rbjzooxbnrfuwtnwczih)
]);

export function isBeheerder(userId: string | null | undefined): boolean {
  return !!userId && BEHEERDERS.has(userId);
}
