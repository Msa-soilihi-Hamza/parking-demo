# Escale Parking — démo de réservation de parking d'aéroport

Projet de démonstration (marque et données fictives) : un parcours de réservation simple, et un
**retour sans appel**. Au lieu de téléphoner une fois ses bagages récupérés, le client appuie sur
**« J'ai mes bagages »** et la demande arrive en direct sur l'écran de l'équipe navette.

## Ce que fait la démo

| Écran | Rôle |
|---|---|
| `/` | Landing page : promesse, fonctionnement, tarifs |
| `/reserver` | Parking et dates avec **prix immédiat**, coordonnées, **vérification de l'e-mail par code à 6 chiffres**, puis **paiement Stripe** (mode test) |
| `/reservation/[token]` | Lien personnel du client (reçu par e-mail) : **QR code à présenter à l'accueil**, bouton « J'ai mes bagages » à tout moment (annulable tant que la navette n'est pas partie), suivi en direct, puis avis (étoiles + commentaire) |
| `/navette` | Équipe navette : clients à récupérer maintenant, planning par jour, historique ; **notifications push** quand un client a ses bagages |
| `/navette/accueil` | Accueil du parking : arrivées du jour ; le QR code du client (ou sa référence) ouvre sa fiche, l'employé note la **place** et valide « Véhicule déposé » |

Pour tester sans réserver (code de l'espace équipe : `navette`) :

- `/reservation/demo-retour` : avion qui vient d'atterrir, bouton « J'ai mes bagages » ;
- `/reservation/demo-arrivee` : client qui arrive au parking, avec son QR code. Scanné avec un téléphone
  connecté à l'espace équipe, il ouvre `/navette/accueil/ESC-DEMOQR`.

## Choix techniques

- **Next.js 16 (App Router, Server Actions), TypeScript, Tailwind CSS, shadcn/ui.**
- **Vérification de l'e-mail avant tout blocage de place.** Le code à 6 chiffres est envoyé par Gmail
  (SMTP), seul son hash est stocké, il expire après 10 minutes et la demande se bloque après 5 essais.
  Une demande non vérifiée ne réserve aucune place : impossible de bloquer le parking avec de fausses
  adresses.
- **PostgreSQL dans Docker**, accès via **Drizzle ORM**, migrations versionnées dans `drizzle/`.
- **Pas de surréservation.** Une fois l'e-mail vérifié, la mise en attente de paiement verrouille la ligne du parking
  (`SELECT … FOR UPDATE`) puis calcule le **pic d'occupation** sur la période demandée. Deux clients qui
  visent la dernière place sont traités l'un après l'autre. Un test d'intégration lance 10 réservations
  simultanées sur un parking d'une place : une seule passe. Sans le verrou, le même test en accepte 10.
- **Vrai Stripe Checkout, en mode test.** La place est retenue 30 minutes, la durée de la session
  Checkout ; une session expirée libère la place (`checkout.session.expired`).
- **Paiement idempotent.** Le webhook vérifie la signature, et la confirmation ne s'applique qu'une fois
  (`UPDATE … WHERE status = 'pending_payment'`) : un événement reçu deux fois ne change rien, et l'e-mail
  de confirmation ne part qu'une fois.
- **Machine à états du retour** : `retour prévu → bagages récupérés → navette en route → pris en charge`.
  Chaque transition est conditionnée au statut courant : un double clic ou deux chauffeurs en même temps
  ne font pas sauter d'étape.
- **Prix calculé par une seule fonction pure**, utilisée par le formulaire (prix en direct) et par le
  serveur (montant facturé) : le prix affiché est le prix payé.
- **Fuseau horaire** : les heures saisies sont en heure de Paris, stockées en UTC. La durée facturée se
  mesure sur l'horloge de Paris : l'heure en plus du changement d'heure d'octobre n'est pas facturée
  comme un jour.
- **Avis clients** : un seul par réservation, possible uniquement après la prise en charge (contrainte
  d'unicité en base). Publiés sur la landing seulement avec l'accord du client, prénom + initiale, **quelle
  que soit la note**. Côté navette, les notes de 1 ou 2 ressortent en rouge pour rappeler le client.
- **Notifications push (Web Push, VAPID)** : le chauffeur active les notifications une fois ; au « J'ai mes
  bagages », il reçoit une notification même site fermé, qui ouvre directement la fiche du client. Les
  abonnements sont en base, les appareils désabonnés sont nettoyés automatiquement. Sur iPhone, il faut
  d'abord ajouter le site à l'écran d'accueil (manifeste PWA fourni).
- **Arrivée au parking par QR code** : le QR code (page de réservation et e-mail de confirmation) ne
  contient que la référence, qui ne donne accès à rien sans la connexion de l'équipe, contrairement au
  lien privé du client. L'enregistrement n'est possible que pour une réservation payée, et une seule fois
  (`UPDATE … WHERE parked_at IS NULL`) : un second scan ne change pas la place notée. Dans l'e-mail, le QR
  code est une image jointe (`cid:`), car Gmail n'affiche pas les images `data:`.
- **Temps réel** par rafraîchissement automatique toutes les 4 à 5 secondes : simple et suffisant à cette
  échelle (WebSocket ou SSE envisageables ensuite).

### Ce qui a été écarté, et pourquoi

Une **API de suivi de vols** a été étudiée puis écartée. Elle aiderait à anticiper les retards, mais le
vrai signal pour la navette, ce sont les bagages, pas l'atterrissage. Les offres gratuites sont aussi
limitées et non commerciales. Elle pourra être branchée plus tard.

## Lancer le projet

Prérequis : Node.js 20+ et Docker.

```bash
cp .env.example .env.local
npm install
npm run db:up        # PostgreSQL sur le port 5434
npm run db:migrate
npm run db:seed      # données de démo, relatives à l'heure actuelle
npm run dev
```

Relancez `npm run db:seed` avant chaque présentation : les retours du jour sont recalculés par rapport
à l'heure courante.

### Configuration (`.env.local`)

- **Stripe, mode test** : clé `sk_test_…` sur https://dashboard.stripe.com/test/apikeys →
  `STRIPE_SECRET_KEY`. Carte de test : `4242 4242 4242 4242`, date future, CVC quelconque.
- **Webhook en local** avec la [Stripe CLI](https://docs.stripe.com/stripe-cli) :

  ```bash
  stripe listen --forward-to localhost:3100/api/stripe/webhook
  ```

  puis copiez le `whsec_…` affiché dans `STRIPE_WEBHOOK_SECRET`. Sans webhook, le retour sur la page de
  réservation confirme aussi le paiement (en interrogeant Stripe).
- **Gmail** : `GMAIL_USER` et un mot de passe d'application (https://myaccount.google.com/apppasswords,
  double authentification requise) dans `GMAIL_APP_PASSWORD`. En développement, sans ces valeurs, les
  e-mails s'affichent dans la console du serveur.

## Mise en production (Vercel + Neon)

- **Base de données : Neon** (PostgreSQL managé). Les identifiants sont dans `.env.neon`, exclu de Git
  (créé par `neon deploy`). L'application utilise l'adresse **pooled** (`DATABASE_URL`, hôte `-pooler`),
  les migrations l'adresse **directe** (`DATABASE_URL_UNPOOLED`), avec `sslmode=verify-full`.
- **Application : Vercel.** Le backend (Server Actions, webhook Stripe, `after()`) tourne dans les
  fonctions Vercel ; `attachDatabasePool` ferme proprement les connexions inutilisées.

```bash
npm run db:migrate:neon   # applique les migrations sur Neon
npm run db:seed:neon      # données de démo (garde les vraies réservations)
npm run smoke:neon        # parcours complet sur Neon, puis nettoyage
```

Variables à définir dans Vercel : `DATABASE_URL` (pooled), `APP_URL` (adresse du site),
`STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` (endpoint
`https://…/api/stripe/webhook` créé dans le tableau de bord Stripe, mode test, événements
`checkout.session.completed` et `checkout.session.expired`), `GMAIL_USER`, `GMAIL_APP_PASSWORD`,
`SHUTTLE_ACCESS_CODE`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

## Tests

```bash
npm test
```

- Tarification (paliers, arrondis, limites)
- Fuseau horaire de Paris (heure d'été, d'hiver, nuit du changement)
- Machine à états du retour
- Code e-mail (format, vérification)
- Nom public des avis (« Sarah M. »)
- Référence et place saisies à l'accueil (format, majuscules, espaces)
- Intégration avec la base : vérification e-mail (mauvais code, blocage après 5 essais), surréservation simultanée, enchaînement de séjours, paiement confirmé une seule fois, annulation du bouton, avis (avant/après prise en charge, un seul), dépôt du véhicule (une seule fois, refusé si non payée)
