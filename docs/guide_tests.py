# -*- coding: utf-8 -*-
"""Contenu du guide de tests (recette) et de dépannage."""
import os

from reportlab.lib.units import mm

from build_pdf import (
    P, code, note, bullets, table, cover, build, next_page_body, Spacer, OUT_DIR
)

TITLE = "Guide de Tests et de Dépannage"

story = cover(
    "Tests & Dépannage",
    "Gestion Pièces Cycles &amp; Motos — Recette de mise en service et diagnostic",
    "Vérifier qu'un poste installé calcule juste,<br/>"
    "et résoudre seul les incidents les plus courants.",
    [
        "Recette de mise en service : 14 vérifications à cocher",
        "Suites de tests automatisées livrées avec le code source",
        "Diagnostic des messages affichés par le logiciel",
        "Incidents de démarrage, d'impression et de synchronisation",
        "Emplacement des fichiers, journaux et procédure de remontée",
    ],
)

story += next_page_body()

# --------------------------------------------------------------------- 1
story += [
    P("1. Comment utiliser ce document", "h1"),
    P("Le chapitre 2 est une <b>recette</b> : une suite de vérifications à exécuter sur le poste "
      "juste après son installation, avant de confier la caisse au personnel. Elle prend environ "
      "20 minutes et valide que les calculs de stock et de bénéfice sont justes sur ce poste précis."),
    P("Les chapitres 4 à 7 sont un <b>guide de diagnostic</b> : cherchez-y le message affiché ou le "
      "symptôme observé."),
    note("Effectuez la recette sur des articles de test créés pour l'occasion (préfixez-les par "
         "« TEST »). Ils pourront être archivés ensuite depuis l'onglet <b>Produits</b>. "
         "N'utilisez pas de vrais articles : les écritures de test resteraient dans les rapports."),
]

# --------------------------------------------------------------------- 2
CHECKS = [
    ["1", "Démarrage",
     "Lancer le logiciel.",
     "L'écran de connexion s'affiche en moins de 10 s, avec le nom du poste en bas du cadre."],
    ["2", "Mot de passe refusé",
     "Se connecter avec <b>admin</b> et un mot de passe faux.",
     "Message « Identifiant ou mot de passe incorrect ». Aucune indication sur l'existence du compte."],
    ["3", "Connexion",
     "Se connecter avec les identifiants du propriétaire.",
     "La barre d'onglets affiche les 12 modules. Le nom et le rôle apparaissent en haut à droite."],
    ["4", "Article de test",
     "Onglet <b>Produits</b> : créer « TEST RÈGLE » avec prix d'achat <b>100,00</b>, "
     "prix détail <b>200,00</b>, stock initial <b>40</b>.",
     "L'article apparaît dans la liste avec un code et un code-barres générés."],
    ["5", "Règle « médiane »",
     "Onglet <b>Bons d'achat</b> : recevoir <b>10</b> unités de cet article à <b>160,00</b>.",
     "Avant validation, la ligne annonce « Médiane » et un prix retenu de <b>130,00</b>. "
     "Après validation, le récapitulatif confirme : stock 40 → 50, prix d'achat 130,00."],
    ["6", "Article stock bas",
     "Créer « TEST STOCK BAS » : prix d'achat <b>100,00</b>, détail <b>200,00</b>, stock initial <b>3</b>.",
     "L'article est créé avec 3 unités."],
    ["7", "Règle « dominant »",
     "Recevoir <b>20</b> unités de cet article à <b>160,00</b>.",
     "La ligne annonce « Dominant » et un prix retenu de <b>160,00</b> (et non 130,00), "
     "car le stock avant réception (3) est inférieur au seuil de 5. Stock 3 → 23."],
    ["8", "Vente et bénéfice",
     "Onglet <b>Caisse</b> : vendre <b>5</b> unités de « TEST STOCK BAS » au prix détail, en espèces.",
     "Le stock passe à 18. Le bénéfice du jour augmente de <b>200,00</b> "
     "soit (200,00 − 160,00) × 5."],
    ["9", "Survente refusée",
     "Tenter de vendre <b>999</b> unités du même article.",
     "La vente est refusée : « Stock insuffisant… ». Le stock reste à 18."],
    ["10", "Retour partiel",
     "Bouton <b>Retour Article</b> : retourner <b>2</b> unités de la vente précédente, "
     "avec un motif.",
     "Le stock remonte à 20, le remboursement affiché est de <b>400,00</b>, "
     "et la vente passe au statut « retour partiel »."],
    ["11", "Ajustement de stock",
     "Onglet <b>Stock</b> : corriger la quantité sans saisir de motif.",
     "L'enregistrement est refusé tant qu'un motif n'est pas saisi."],
    ["12", "Cloisonnement caissier",
     "Se déconnecter, se reconnecter avec un compte <b>Caissier</b>.",
     "Les onglets Bons d'achat, Rapports, Journal et Utilisateurs ont disparu. "
     "Dans Produits, la colonne « Prix d'achat » est vide."],
    ["13", "Journal d'audit",
     "Revenir en propriétaire, onglet <b>Journal</b>.",
     "Toutes les opérations ci-dessus y figurent, horodatées et nominatives. "
     "La ligne « Prix d'achat recalculé » montre l'avant/après 100,00 → 160,00."],
    ["14", "Impression",
     "Réimprimer un ticket de la journée.",
     "Le ticket sort avec l'en-tête du magasin, les lignes vendues et le pied de page."],
]

story += [
    P("2. Recette de mise en service", "h1"),
    P("Cochez chaque ligne. Une seule case non conforme doit interrompre la mise en service : "
      "reportez-vous au chapitre correspondant, puis reprenez la recette depuis le début."),
    table(
        ["N°", "Objet", "Action", "Résultat attendu", "OK"],
        [[c[0], c[1], c[2], c[3], ""] for c in CHECKS],
        [8 * mm, 24 * mm, 54 * mm, 76 * mm, 8 * mm],
        align_center=(0, 4),
    ),
    Spacer(1, 3 * mm),
    note("Après la recette, archivez les articles « TEST » depuis l'onglet <b>Produits</b> et "
         "signalez au propriétaire que les écritures de test apparaîtront dans les rapports du "
         "jour. Sur une mise en service en conditions réelles, effectuez la recette <b>avant</b> "
         "la première vraie vente."),
]

# --------------------------------------------------------------------- 3
story += [
    P("3. Tests automatisés (installateur / intégrateur)", "h1"),
    P("Le code source est livré avec trois suites de tests qui s'exécutent sur une base réelle. "
      "Elles ne remplacent pas la recette du chapitre 2 — qui valide <i>ce poste-ci</i> — mais "
      "elles valident le logiciel après toute modification."),
    P("3.1 Règles métier et migration", "h2"),
    code("pnpm --filter @gestion-veloo/desktop test"),
    table(
        ["Suite", "Ce qui est vérifié", "Attendu"],
        [
            ["Règles métier",
             "Les deux branches de la règle de prix d'achat, l'entrée et la sortie de stock, le "
             "refus de survente, les retours partiels puis totaux, l'écriture du journal et le "
             "cloisonnement du caissier.",
             "44 vérifications réussies"],
            ["Migration",
             "Ouverture d'une copie d'une base existante : aucune perte de données, création des "
             "nouvelles tables et colonnes, permissions complétées, rejouabilité.",
             "27 vérifications réussies"],
        ],
        [30 * mm, 106 * mm, 34 * mm],
    ),
    P("3.2 Chaîne serveur et portail", "h2"),
    P("Démarrez d'abord l'API avec une clé de test, puis lancez la suite :"),
    code("SYNC_API_KEY=test-key-123 PORT=3055 pnpm --filter @gestion-veloo/server dev\n"
         "pnpm --filter @gestion-veloo/server test"),
    P("26 vérifications : authentification du portail, refus d'un envoi sans clé ou avec une "
      "mauvaise clé, ingestion du journal, absence de doublon en cas de renvoi, lecture du "
      "journal et refus d'accès pour un caissier."),
    note("<b>Note technique.</b> Le module <i>better-sqlite3</i> est compilé pour l'ABI d'Electron "
         "et ne se charge pas avec le Node du système. Le lanceur de tests de la caisse "
         "(<i>tests/run.cjs</i>) relance automatiquement les suites via le binaire Electron ; "
         "il n'y a rien à faire de particulier."),
]

# --------------------------------------------------------------------- 4
story += [
    P("4. Messages affichés par le logiciel", "h1"),
    P("Ces messages sont volontaires : ils signalent une règle qui s'applique, pas une panne."),
    table(
        ["Message", "Ce qu'il signifie", "Que faire"],
        [
            ["Identifiant ou mot de passe incorrect",
             "Le couple saisi ne correspond à aucun compte actif. Le message est identique que le "
             "compte existe ou non, pour ne pas révéler les identifiants en place.",
             "Vérifier la casse et la disposition du clavier. Après 5 échecs, le compte se verrouille."],
            ["Trop de tentatives. Compte verrouillé pendant 15 minutes.",
             "Protection contre les essais de mots de passe.",
             "Attendre 15 minutes, ou demander au propriétaire de déverrouiller le compte depuis "
             "l'onglet <b>Utilisateurs</b> (icône cadenas)."],
            ["Ce compte est désactivé.",
             "Le compte existe mais a été désactivé.",
             "Le propriétaire le réactive depuis l'onglet <b>Utilisateurs</b>."],
            ["Session expirée pour inactivité.",
             "Plus de 60 minutes sans action.",
             "Se reconnecter. Le panier en cours est perdu : encaissez avant de quitter le poste."],
            ["Accès refusé : votre profil… ne permet pas de…",
             "Le compte n'a pas le droit demandé sur ce module. La tentative est inscrite au journal.",
             "Le propriétaire accorde le droit dans <b>Utilisateurs</b>, colonne Consulter ou Modifier."],
            ["Stock insuffisant pour « … » : n en stock, m demandé(s).",
             "La vente dépasserait le stock disponible.",
             "Corriger la quantité, régulariser le stock (onglet <b>Stock</b>), ou autoriser la "
             "vente en stock négatif dans les paramètres si le commerce le justifie."],
            ["Retour impossible : n unité(s) restante(s) sur cette ligne.",
             "On tente de retourner plus que ce qui a été vendu et non encore retourné.",
             "Vérifier l'historique des retours de ce ticket."],
            ["Plafond de crédit dépassé pour …",
             "La vente à crédit ferait dépasser la limite fixée sur la fiche client.",
             "Encaisser un versement, ou relever le plafond dans la fiche du client."],
            ["Un motif est obligatoire pour tout ajustement de stock.",
             "Les corrections d'inventaire doivent être justifiées : elles sont tracées au journal.",
             "Saisir un motif d'au moins trois caractères."],
            ["Suppression impossible : n article(s) utilisent encore « … »",
             "On supprime une catégorie, marque, couleur ou modèle encore rattaché à des articles.",
             "Réaffecter les articles concernés, puis supprimer."],
        ],
        [44 * mm, 66 * mm, 60 * mm],
    ),
]

# --------------------------------------------------------------------- 5
story += [
    P("5. Incidents au démarrage et à l'usage", "h1"),
    table(
        ["Symptôme", "Cause probable", "Solution"],
        [
            ["Rien ne se passe au double-clic, ou la fenêtre se ferme aussitôt.",
             "Un antivirus bloque l'exécutable non signé, ou une première instance tourne déjà.",
             "Vérifier la quarantaine de l'antivirus et autoriser le programme. Dans le "
             "Gestionnaire des tâches, terminer les processus « Gestion Pièces… » restants, puis "
             "relancer. Le logiciel n'autorise qu'une seule instance."],
            ["« Initialisation impossible — la base de données locale n'a pas pu être préparée. »",
             "Le fichier de base est verrouillé, en lecture seule, ou le disque est plein.",
             "Fermer toute autre instance. Vérifier l'espace disque. Contrôler que le dossier "
             "%APPDATA%\\@gestion-veloo\\desktop n'est pas en lecture seule ni synchronisé par un "
             "OneDrive bloquant."],
            ["La fenêtre s'ouvre mais reste vide.",
             "Affichage matériel incompatible sur certains postes anciens.",
             "Mettre à jour le pilote de la carte graphique. En dernier recours, lancer le "
             "programme avec l'option <i>--disable-gpu</i>."],
            ["Les données ont disparu après un changement de poste ou de session Windows.",
             "La base est stockée dans le profil de l'utilisateur Windows : une autre session "
             "Windows a sa propre base.",
             "Se reconnecter à la session Windows habituelle, ou restaurer une sauvegarde "
             "(guide d'installation, chapitre 9)."],
            ["La douchette écrit dans le champ mais ne valide pas l'article.",
             "Le lecteur n'est pas configuré pour envoyer un retour chariot en fin de code.",
             "Configurer le lecteur pour ajouter un suffixe <i>Entrée</i> (voir sa notice, "
             "généralement un code-barres de configuration)."],
            ["L'imprimante n'apparaît pas dans la liste.",
             "Le pilote n'est pas installé, ou l'imprimante est hors tension.",
             "Imprimer une page de test depuis Windows. Tant que Windows ne l'imprime pas, le "
             "logiciel ne la verra pas. Puis rouvrir l'onglet <b>Paramètres</b>."],
            ["Le ticket sort décalé ou coupé.",
             "Largeur de papier mal réglée dans le pilote.",
             "Régler le format sur 80 mm dans les propriétés de l'imprimante Windows, puis "
             "réimprimer un ticket de test."],
            ["L'application ralentit après plusieurs mois.",
             "Historique volumineux, ou photos d'articles trop lourdes.",
             "Les photos sont limitées à 2 Mo à l'import. Archiver les articles qui ne sont plus "
             "vendus. Si la lenteur persiste, transmettre la base au support."],
        ],
        [46 * mm, 52 * mm, 72 * mm],
    ),
]

# --------------------------------------------------------------------- 6
story += [
    P("6. Incidents de synchronisation", "h1"),
    P("La synchronisation n'est jamais bloquante : en cas d'échec, la caisse continue de "
      "fonctionner et les données partent à la tentative suivante. Chaque échec est lui-même "
      "inscrit au journal."),
    table(
        ["Message", "Cause", "Solution"],
        [
            ["Ce poste n'est pas autorisé par le serveur central.",
             "La clé de synchronisation saisie sur la caisse ne correspond pas à SYNC_API_KEY "
             "côté serveur (ou elle est absente).",
             "Recopier exactement la même valeur dans <b>Paramètres → Portail central</b>. "
             "Attention aux espaces en fin de chaîne."],
            ["Le serveur central n'a pas répondu dans le délai imparti.",
             "Serveur arrêté, en veille (hébergement gratuit), ou connexion trop lente.",
             "Ouvrir l'adresse du serveur dans un navigateur : la page d'accueil de l'API doit "
             "répondre. Relancer ensuite la synchronisation."],
            ["Attention : le serveur accepte ce poste sans clé de synchronisation.",
             "SYNC_API_KEY n'est pas définie côté serveur : n'importe qui pourrait alimenter la "
             "base centrale.",
             "Définir la variable côté serveur, puis reporter la clé sur chaque caisse. "
             "À traiter avant la mise en production."],
            ["Le portail n'affiche pas les dernières ventes.",
             "Aucune synchronisation n'a été lancée depuis, ou le poste était hors ligne.",
             "Sur la caisse, cliquer sur le bouton de synchronisation dans la barre du haut. "
             "Dans le portail, onglet <b>Caisses connectées</b>, vérifier la date de dernière "
             "activité du poste."],
            ["Le portail refuse la connexion du gérant (403).",
             "Le compte n'a pas le droit de consultation sur le module Journal.",
             "Le propriétaire accorde le droit depuis l'onglet <b>Utilisateurs</b>."],
        ],
        [44 * mm, 60 * mm, 66 * mm],
    ),
]

# --------------------------------------------------------------------- 7
story += [
    P("7. Informations utiles au support", "h1"),
    P("Avant toute demande d'assistance, rassemblez les éléments suivants : ils permettent de "
      "diagnostiquer sans accès au magasin."),
    table(
        ["Élément", "Où le trouver"],
        [
            ["Identifiant du poste",
             "En bas du cadre de connexion, au format POS-XXXXXX. Il identifie la caisse dans le portail."],
            ["Version du logiciel",
             "Journal d'audit : ouvrir une entrée, champ <b>Version</b>."],
            ["Message d'erreur exact",
             "Photographier ou recopier le message entier, sans le reformuler."],
            ["Heure de l'incident",
             "Nécessaire pour retrouver l'opération dans le journal d'audit."],
            ["Export du journal",
             "Onglet <b>Journal</b>, filtrer sur la période concernée, puis <b>Exporter CSV</b>."],
            ["Base de données (si demandée)",
             "Fermer le logiciel, puis copier le dossier %APPDATA%\\@gestion-veloo\\desktop. "
             "Il contient les données commerciales du magasin : ne le transmettre qu'au support "
             "et par un canal sûr."],
        ],
        [42 * mm, 128 * mm],
    ),
    note("Le journal d'audit est en <b>ajout seul</b> : aucune opération de l'application ne le "
         "modifie ni ne l'efface. C'est la source de référence pour reconstituer ce qui s'est "
         "réellement passé, y compris les tentatives d'accès refusées."),

    P("8. Ce que le logiciel garantit", "h1"),
    bullets([
        "Chaque vente, achat, retour, ajustement et transfert est écrit en une seule opération "
        "indivisible : il ne peut pas rester un stock modifié sans l'écriture comptable "
        "correspondante, même en cas de coupure de courant.",
        "Le coût de revient est figé sur la ligne de vente au moment de l'encaissement : "
        "modifier un prix d'achat plus tard ne change jamais un bénéfice déjà réalisé.",
        "Une perte s'affiche comme une perte : les bénéfices ne sont pas ramenés à zéro.",
        "Un remboursement se calcule à partir du prix réellement facturé, remise globale comprise, "
        "et ne peut pas dépasser ce qui a été vendu.",
        "Les droits sont vérifiés à l'endroit où la donnée est lue ou écrite, pas seulement dans "
        "l'affichage : masquer un bouton n'est jamais la seule protection.",
    ]),
]

build(os.path.join(OUT_DIR, "Guide-Tests-et-Depannage.pdf"), TITLE, story)
