## Version 2.2.0

### Second habillage « Classique (gestion Windows) »
Un deuxieme choix de presentation, dans l'esprit des logiciels de gestion
WinDev / Windows Forms, a activer dans **Parametres > Apparence de
l'application**. L'ecran Produit y dispose de sa barre d'icones a acces rapide
tout en haut (F1:Nouveau, F4:Appliquer, F2:Supprimer, F6:Annuler, Precedent /
Suivant, Chang. N.Prod, Liste produits, Hist. produit, Imprimer, Calculatrice,
Rafraichir, Quitter), de cinq sous-onglets (Maj Produit, Code-Barres,
Compatibilites, Photo, Stock & Emplacement) et de lignes de saisie ou le
libelle fait face a son champ. L'habillage « Moderne » reste le defaut.

### Quantite par couleur
Un article decline en plusieurs couleurs recoit une quantite pour chacune, et
la quantite de l'article devient leur somme : elle ne se saisit plus. Toutes
les operations qui bougent du stock suivent — une vente et une reception
nomment leur couleur et sont refusees sans elle, un retour remet les pieces
dans la couleur d'ou elles sont parties.

### La caisse demande la couleur vendue
Ajouter un article multicolore ouvre la question « Quelle couleur
vendez-vous ? », avec ce qui reste de chaque couleur. Une couleur a zero ne
peut pas etre choisie. La douchette passe par le meme chemin.

### Vente a perte impossible
La modification du prix unitaire et la remise ne peuvent plus ramener une vente
sous le prix d'achat. La regle est appliquee par l'interface et par le process
principal : appeler le canal directement est refuse aussi.

### Periode d'essai portee a 7 jours
Elle durait 24 h, trop court pour evaluer une caisse sur une semaine de travail.

### Corrections
Categories de depenses creables et supprimables, catalogue trie par numero
croissant, theme clair adouci en creme, dates et couleurs de categorie
corrigees sur l'ecran Depenses.

---

Les regles de calcul sont inchangees : prix d'achat dominant sous 5 unites en
stock et median au-dela, benefice fige au moment de la vente, permissions par
role, journal d'audit. 101 verifications automatiques (74 regles metier,
27 migration).

### Installation
- **Portable** : telecharger `Gestion-Pieces-Moto-POS-Portable.exe` et
  l'executer. Aucune installation.
- **Installateur** : `Gestion-Pieces-Moto-POS-Setup.exe` cree un raccourci sur
  le bureau.

La mise a jour depuis une version precedente conserve les donnees : la base est
migree au demarrage, sans perte.
