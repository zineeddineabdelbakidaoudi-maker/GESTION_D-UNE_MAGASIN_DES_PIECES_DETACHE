# -*- coding: utf-8 -*-
"""Contenu du guide d'installation et de démarrage."""
import os

from reportlab.lib.units import mm

from build_pdf import (
    P, code, note, bullets, table, cover, build, next_page_body, Spacer, OUT_DIR
)

TITLE = "Guide d'Installation et de Démarrage"

story = cover(
    "Installation & Démarrage",
    "Gestion Pièces Cycles &amp; Motos — Logiciel de caisse et de gestion commerciale",
    "Mise en service d'un poste de caisse, de la première ouverture<br/>"
    "jusqu'à la liaison avec le portail de supervision.",
    [
        "Contenu de la livraison et matériel requis",
        "Installation du logiciel sur le poste de caisse",
        "Première connexion et sécurisation des comptes",
        "Création des utilisateurs et attribution des droits",
        "Paramétrage de la boutique, de l'imprimante et des règles de stock",
        "Liaison au portail web de supervision",
        "Sauvegarde, restauration et raccourcis clavier",
    ],
)

story += next_page_body()

# --------------------------------------------------------------------- 1 & 2
story += [
    P("1. Contenu de la livraison", "h1"),
    P("Le dossier de livraison contient les éléments suivants. Conservez-le : il permet de "
      "réinstaller le logiciel sur un nouveau poste sans connexion internet."),
    table(
        ["Fichier", "Rôle"],
        [
            ["Installation/Gestion-POS-Setup-&lt;version&gt;.exe",
             "Programme d'installation. Crée un raccourci sur le bureau et dans le menu Démarrer. "
             "C'est la méthode recommandée."],
            ["Installation/Gestion-POS-Portable-&lt;version&gt;.exe",
             "Version portable, à lancer directement depuis une clé USB ou un dossier, sans installation."],
            ["Documentation/Guide-Installation-et-Demarrage.pdf", "Le présent document."],
            ["Documentation/Guide-Tests-et-Depannage.pdf",
             "Procédure de vérification après installation et résolution des incidents courants."],
            ["LISEZ-MOI.txt",
             "Résumé d'une page : identifiants de première connexion et étapes essentielles."],
        ],
        [64 * mm, 106 * mm],
    ),
    Spacer(1, 3 * mm),

    P("2. Matériel et système requis", "h1"),
    table(
        ["Élément", "Minimum", "Recommandé"],
        [
            ["Système", "Windows 10 64 bits", "Windows 10 ou 11 64 bits à jour"],
            ["Mémoire", "4 Go", "8 Go"],
            ["Disque", "500 Mo libres", "2 Go libres (historique et photos d'articles)"],
            ["Écran", "1366 × 768", "1920 × 1080 — la caisse affiche alors plus d'articles"],
            ["Douchette", "Optionnelle", "Lecteur code-barres USB en mode clavier (HID)"],
            ["Imprimante", "Optionnelle", "Imprimante ticket thermique 80 mm (USB ou réseau)"],
            ["Internet", "Non requis", "Utile uniquement pour alimenter le portail de supervision"],
        ],
        [30 * mm, 46 * mm, 94 * mm],
    ),
    note("Le logiciel fonctionne entièrement hors ligne. Toutes les données sont enregistrées sur "
         "le poste lui-même : une coupure d'internet n'interrompt jamais la vente."),
]

# --------------------------------------------------------------------- 3
story += [
    P("3. Installation", "h1"),
    P("3.1 Avec le programme d'installation (recommandé)", "h2"),
    bullets([
        "Ouvrez le dossier <b>Installation</b> et double-cliquez sur le fichier <b>Setup</b>.",
        "Windows peut afficher l'avertissement « Windows a protégé votre ordinateur » : cliquez "
        "sur <b>Informations complémentaires</b>, puis sur <b>Exécuter quand même</b>. Cet "
        "avertissement apparaît parce que le programme n'est pas signé par un certificat "
        "commercial ; il ne traduit aucun défaut du fichier livré.",
        "Choisissez le dossier d'installation, puis laissez l'assistant se terminer.",
        "Un raccourci <b>Gestion Pièces Cycles &amp; Motos POS</b> est créé sur le bureau.",
    ]),
    P("3.2 Version portable", "h2"),
    P("Copiez le fichier <b>Portable</b> dans le dossier de votre choix et lancez-le. Aucune "
      "installation n'est effectuée. Les données restent malgré tout enregistrées dans le profil "
      "Windows de l'utilisateur, à l'emplacement indiqué ci-dessous."),
    P("3.3 Où sont enregistrées les données", "h2"),
    P("La base de données du magasin se trouve dans le profil de l'utilisateur Windows :"),
    code(r"%APPDATA%\@gestion-veloo\desktop\pos_local.sqlite"),
    P("Collez ce chemin dans la barre d'adresse de l'Explorateur Windows pour y accéder. "
      "C'est ce fichier qu'il faut sauvegarder (chapitre 9)."),
]

# --------------------------------------------------------------------- 4 & 5
story += [
    P("4. Première connexion", "h1"),
    P("Au premier lancement, le logiciel crée la base du magasin et trois comptes de départ :"),
    table(
        ["Identifiant", "Mot de passe", "Rôle", "Portée"],
        [
            ["admin", "admin123", "Propriétaire", "Toutes les boutiques, tous les modules"],
            ["vendeur1", "vendeur123", "Caissier", "Boutique 1"],
            ["vendeur2", "vendeur123", "Caissier", "Boutique 2"],
        ],
        [30 * mm, 30 * mm, 32 * mm, 78 * mm],
    ),
    note("<b>À faire immédiatement.</b> Connectez-vous avec le compte <b>admin</b>, ouvrez le menu "
         "à votre nom en haut à droite, puis <b>Changer mon mot de passe</b>. Faites de même pour "
         "chaque compte conservé, et désactivez ceux qui ne servent pas. Les mots de passe livrés "
         "sont identiques sur tous les postes : les laisser en place reviendrait à laisser la "
         "caisse ouverte.", "warn"),
    P("Protections en place sur les comptes :"),
    bullets([
        "Les mots de passe sont stockés chiffrés (bcrypt) : ils ne sont lisibles nulle part, "
        "y compris par le propriétaire.",
        "Après 5 échecs de connexion consécutifs, le compte est verrouillé 15 minutes. Le "
        "propriétaire peut le déverrouiller immédiatement depuis l'onglet <b>Utilisateurs</b>.",
        "Une session inactive pendant 60 minutes est fermée automatiquement.",
        "Chaque connexion, échec et verrouillage est inscrit au journal d'audit.",
    ]),

    P("5. Créer les comptes et attribuer les droits", "h1"),
    P("Onglet <b>Utilisateurs</b> (réservé au propriétaire), bouton <b>Nouveau compte</b>. "
      "Le rôle choisi pré-remplit les droits, puis chaque module reste ajustable individuellement."),
    table(
        ["Rôle", "Ce qu'il peut faire"],
        [
            ["Propriétaire",
             "Tout, y compris la gestion des comptes, les paramètres et le journal d'audit."],
            ["Gérant",
             "Sa boutique : ventes, achats, stock, dépenses, rapports. Pas de gestion des comptes."],
            ["Caissier",
             "Encaissement et clients. <b>Ne voit ni les prix d'achat ni les marges.</b>"],
            ["Auditeur",
             "Consultation seule de toutes les données et du journal, sans aucune modification."],
        ],
        [32 * mm, 138 * mm],
    ),
    P("Pour chaque module, deux droits sont distingués : <b>Consulter</b> (ouvrir l'écran) et "
      "<b>Modifier</b> (enregistrer une opération). Accorder la modification accorde "
      "automatiquement la consultation. Les modules interdits n'apparaissent pas dans la barre "
      "d'onglets."),
    note("Le masquage des prix d'achat n'est pas qu'un affichage : un compte sans accès au module "
         "<b>Bons d'achat</b> ni au module <b>Rapports</b> ne reçoit jamais ces montants."),
]

# --------------------------------------------------------------------- 6
story += [
    P("6. Paramétrer la boutique", "h1"),
    P("Onglet <b>Paramètres</b>. Renseignez d'abord l'identité commerciale, reprise en tête de "
      "chaque ticket : nom du magasin, adresse, téléphone, NIF, NIS, RC, article d'imposition et "
      "pied de page du ticket."),

    P("6.1 Imprimante ticket", "h2"),
    bullets([
        "Installez d'abord le pilote de l'imprimante dans Windows et imprimez une page de test "
        "depuis Windows. Tant que Windows ne voit pas l'imprimante, le logiciel ne la verra pas.",
        "Dans <b>Paramètres</b>, choisissez le type de connexion puis sélectionnez l'imprimante "
        "dans la liste proposée.",
        "Utilisez le bouton d'impression de test pour vérifier la mise en page avant la première vente.",
    ]),

    P("6.2 Règles de stock et de prix d'achat", "h2"),
    P("Ce réglage détermine comment le prix d'achat d'un article évolue à chaque réception de "
      "marchandise. C'est le cœur du calcul des bénéfices : le prix retenu ici sert de coût de "
      "revient pour toutes les ventes suivantes."),
    table(
        ["Stock restant <b>avant</b> la réception", "Prix d'achat retenu"],
        [
            ["Inférieur au seuil (5 par défaut)",
             "<b>Le nouveau prix devient dominant</b> : il remplace l'ancien. Il ne reste presque "
             "plus de marchandise à l'ancien coût, celui-ci ne doit donc plus peser."],
            ["Supérieur ou égal au seuil",
             "<b>Médiane</b> : (ancien prix + nouveau prix) ÷ 2."],
        ],
        [60 * mm, 110 * mm],
    ),
    P("Deux cas particuliers : si l'article n'avait aucun prix d'achat connu, le prix reçu devient "
      "la référence ; si le prix saisi est nul, l'ancien prix est conservé."),
    P("Le seuil se modifie dans <b>Paramètres → Règles de stock et de prix d'achat</b>, où vous "
      "réglez également :"),
    bullets([
        "<b>Alerte stock bas</b> : seuil d'alerte par défaut, utilisé lorsqu'aucun minimum n'est "
        "défini sur l'article.",
        "<b>Vente en stock négatif</b> : désactivée par défaut. Tant qu'elle l'est, toute vente "
        "dépassant le stock disponible est refusée.",
    ]),
    note("Sur l'écran <b>Bons d'achat</b>, chaque ligne affiche le stock avant et après réception, "
         "le prix d'achat qui en résulte et la règle appliquée (<i>Dominant</i> ou <i>Médiane</i>) "
         "<b>avant</b> l'enregistrement. Après validation, un récapitulatif confirme ce qui a "
         "réellement été écrit dans la base."),
]

# --------------------------------------------------------------------- 7 & 8
story += [
    P("7. Liaison au portail web de supervision", "h1"),
    P("Le portail permet au propriétaire de consulter à distance l'activité de toutes les "
      "boutiques : ventes, achats, retours, mouvements de stock, dépenses, historique des prix "
      "d'achat et journal d'audit complet. Cette liaison est <b>facultative</b> : la caisse "
      "fonctionne sans."),
    P("7.1 Côté serveur", "h2"),
    P("Définissez la variable d'environnement <b>SYNC_API_KEY</b> avec une valeur longue et "
      "aléatoire, ainsi que <b>JWT_SECRET</b>. Sur un hébergement Render, ces valeurs se "
      "saisissent dans l'onglet <i>Environment</i> du service."),
    P("7.2 Côté caisse", "h2"),
    bullets([
        "Onglet <b>Paramètres</b>, section <b>Portail central &amp; synchronisation</b>.",
        "Saisissez l'adresse du serveur, puis la <b>même clé</b> que SYNC_API_KEY.",
        "Cliquez sur <b>Enregistrer la liaison</b>, puis sur <b>Tester la synchronisation</b>.",
        "Un message de confirmation indique le nombre d'enregistrements transmis.",
    ]),
    note("Sans clé configurée côté serveur, les envois sont acceptés mais signalés comme « non "
         "authentifiés » dans le portail : n'importe qui pourrait alors alimenter la base centrale. "
         "Configurez la clé avant la mise en production.", "warn"),
    P("La synchronisation est cumulative et sans doublon : renvoyer un lot déjà transmis ne crée "
      "aucune duplication. Les opérations réalisées hors ligne restent en attente et partent à la "
      "connexion suivante."),

    P("8. Les onglets en un coup d'œil", "h1"),
    table(
        ["Onglet", "À quoi il sert"],
        [
            ["Caisse", "Encaisser. Scannez ou recherchez l'article, choisissez le tarif (détail, "
                       "semi-gros, gros), encaissez et imprimez le ticket. Le bouton <b>Retour "
                       "Article</b> gère les retours."],
            ["Produits", "Créer et modifier les articles : prix, emplacement, codes-barres, photo, "
                         "compatibilités moto."],
            ["Stock", "Consulter les quantités, corriger un inventaire (motif obligatoire) et "
                      "transférer entre boutiques."],
            ["Bons d'achat", "Enregistrer une réception fournisseur. Le stock augmente et le prix "
                             "d'achat est recalculé selon la règle du chapitre 6.2."],
            ["Clients", "Fiches clients, plafond de crédit, suivi des dettes et encaissement des versements."],
            ["Fournisseurs", "Fiches fournisseurs, dettes en cours et règlements."],
            ["Dépenses", "Charges du magasin (loyer, électricité, salaires…). Elles se déduisent du bénéfice net."],
            ["Rapports", "Chiffre d'affaires, bénéfices, meilleures ventes, ventes par vendeur et "
                         "par mode de paiement."],
            ["Journal", "Registre de toutes les opérations, avec leur auteur et le détail avant/après."],
            ["Utilisateurs", "Comptes, rôles et droits par module."],
            ["Paramètres", "Boutique, imprimante, règles de stock, raccourcis et liaison au portail."],
        ],
        [30 * mm, 140 * mm],
    ),
]

# --------------------------------------------------------------------- 9, 10, 11
story += [
    P("9. Sauvegarde et restauration", "h1"),
    note("Toute l'activité du magasin tient dans un seul fichier. Une sauvegarde régulière est la "
         "seule protection contre une panne de disque ou un vol du poste.", "warn"),
    P("9.1 Sauvegarder", "h2"),
    bullets([
        "<b>Fermez complètement le logiciel</b> : une copie prise pendant l'utilisation peut être "
        "incomplète.",
        "Ouvrez l'Explorateur Windows et collez ce chemin dans la barre d'adresse :",
    ]),
    code(r"%APPDATA%\@gestion-veloo\desktop"),
    bullets([
        "Copiez <b>pos_local.sqlite</b>, ainsi que <b>pos_local.sqlite-wal</b> et "
        "<b>pos_local.sqlite-shm</b> s'ils sont présents.",
        "Collez-les sur une clé USB ou un disque externe, dans un dossier daté "
        "(par exemple <i>Sauvegarde-2026-09-21</i>).",
    ]),
    P("Rythme conseillé : une sauvegarde par semaine, et systématiquement avant une mise à jour du "
      "logiciel. Conservez les quatre dernières."),
    P("9.2 Restaurer", "h2"),
    bullets([
        "Fermez le logiciel.",
        "Remplacez les fichiers du dossier ci-dessus par ceux de la sauvegarde.",
        "Relancez le logiciel. Les données sont celles du jour de la sauvegarde ; les opérations "
        "postérieures sont perdues.",
    ]),

    P("10. Raccourcis clavier", "h1"),
    P("Les raccourcis se personnalisent dans <b>Paramètres → Raccourcis clavier</b>. "
      "Valeurs livrées par défaut :"),
    table(
        ["Touche", "Action", "Touche", "Action"],
        [
            ["F1", "Caisse", "F8", "Dépenses"],
            ["F2", "Produits", "F9", "Paramètres"],
            ["F3", "Stock", "F10", "Journal d'audit"],
            ["F4", "Bons d'achat", "F11", "Utilisateurs"],
            ["F5", "Clients", "Ctrl + F", "Rechercher"],
            ["F6", "Fournisseurs", "Ctrl + N", "Nouvel article"],
            ["F7", "Rapports", "Ctrl + P", "Imprimer le ticket"],
            ["Entrée", "Valider", "Échap", "Annuler / fermer"],
        ],
        [22 * mm, 63 * mm, 22 * mm, 63 * mm],
        align_center=(0, 2),
    ),
    P("Les flèches gauche et droite font défiler les onglets lorsque la barre d'onglets a le focus. "
      "Les raccourcis sont ignorés pendant la saisie dans un champ, pour ne pas gêner la douchette."),

    P("11. En cas de problème", "h1"),
    P("Le document <b>Guide de Tests et de Dépannage</b>, livré avec ce logiciel, contient la "
      "procédure de vérification à exécuter après l'installation ainsi que le traitement des "
      "incidents courants : message d'erreur, compte verrouillé, imprimante introuvable, "
      "synchronisation refusée."),
]

build(os.path.join(OUT_DIR, "Guide-Installation-et-Demarrage.pdf"), TITLE, story)
