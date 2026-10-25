# Escale Parking — démo de réservation de parking d'aéroport

Projet de démonstration (marque et données fictives) : un parcours de réservation simple, et un
**retour sans appel**. Au lieu de téléphoner une fois ses bagages récupérés, le client appuie sur
**« J'ai mes bagages »** et la demande arrive en direct sur l'écran de l'équipe navette.

## Ce que fait la démo

| Écran | Rôle |
|---|---|
| `/` | Landing page : promesse, fonctionnement, tarifs |
| `/reserver` | Parking et dates avec **prix immédiat**, **code promo**, coordonnées, **vérification de l'e-mail par code à 6 chiffres**, puis **paiement Stripe** (mode test) |
| `/reservation/[token]` | Lien personnel du client (reçu par e-mail) : **QR code à présenter à l'accueil**, bouton « J'ai mes bagages » à tout moment (annulable tant que la navette n'est pas partie), suivi en direct, puis avis (étoiles + commentaire) |
| `/navette` | **Espace navette** (chauffeurs, code `navette`) : « En direct » (clients à récupérer maintenant, **notifications push** quand un client a ses bagages) et « Journées » (une bande de jours du passé au futur : retours prévus, puis temps d'attente et notes une fois la journée passée) |
| `/accueil` | **Accueil du parking** (code `accueil`) : « Arrivées » (voitures attendues aujourd'hui ; le QR code du client ou sa référence ouvre sa fiche, l'agent valide « Véhicule déposé » avec la **place proposée** ou une autre), « Plan » (les places de chaque parking, libres, occupées ou à sortir bientôt, et la prochaine place à donner), « Véhicules » (voitures sur place, recherche par plaque, nom, référence ou place, et liste **À préparer** : clients en route ou de retour dans les 3 h) et « Nouveau client » (un client **sans réservation** paie sur place et laisse sa voiture) |
| `/gestion` | **Gestion** (responsable, code `gestion`) : créer un code promo (réduction en % ou en €, **valable N jours**, nombre d'utilisations facultatif), voir les utilisations et le statut de chaque code (actif, expiré, épuisé, désactivé), désactiver ou réactiver |

Chaque métier a son espace et son code : les chauffeurs ne voient que la navette, l'accueil que le parking, le responsable que la gestion des codes promo.

Pour tester sans réserver :

- `/reservation/demo-retour` : avion qui vient d'atterrir, bouton « J'ai mes bagages » ;
- `/reservation/demo-arrivee` : client qui arrive au parking, avec son QR code. Scanné avec un téléphone
  connecté à l'accueil, il ouvre `/accueil/reservation/ESC-DEMOQR`.

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
- **Prix stables, calculés par le serveur avec les mêmes fonctions partout** (formulaire en direct,
  réservation, accueil) : le prix affiché est le prix payé. Jours dégressifs (-20 % à partir du 4e jour,
  -40 % à partir du 8e), puis éventuellement un code promo. Le prix ne dépend pas du remplissage du
  parking : la tarification dynamique a été étudiée puis écartée (marque « pas chère », même prix pour tous).
- **Codes promo, créés par le responsable** dans l'espace Gestion : pourcentage ou montant, **valable N
  jours à partir d'aujourd'hui** (jusqu'à la fin du dernier jour, heure de Paris), nombre d'utilisations
  limité ou non, désactivable à tout moment (code qui a fuité sur un site de bons plans). Le prix ne
  descend jamais sous 1 €. Un code refusé n'est jamais retiré en silence : la réservation s'arrête avec le
  message. Les utilisations sont comptées à partir des réservations (payées ou place retenue), sous verrou
  de la ligne du code au moment de retenir la place : deux clients ne peuvent pas prendre la dernière
  utilisation. Codes de démo : `BIENVENUE10` (-10 %), `TOUSSAINT5` (-5 €, 10 jours), `FLASH50` (-50 %,
  3 réservations), `ETE2026` (expiré).
- **Parrainage étudié puis écarté** : construit (code client au retour, -10 % pour le filleul, 5 € pour le
  parrain), puis retiré. Même en codes plutôt qu'en argent, il ouvre trop de portes à la fraude pour une
  petite équipe (alias e-mail, cartes et voitures empruntées, codes publiés) ; les codes promo du
  responsable couvrent le besoin marketing avec un risque maîtrisé.
- **Arrivée au parking par QR code** : le QR code (page de réservation et e-mail de confirmation) ne
  contient que la référence, qui ne donne accès à rien sans la connexion de l'équipe, contrairement au
  lien privé du client. L'enregistrement n'est possible que pour une réservation payée, et une seule fois
  (`UPDATE … WHERE parked_at IS NULL`) : un second scan ne change pas la place notée. Dans l'e-mail, le QR
  code est une image jointe (`cid:`), car Gmail n'affiche pas les images `data:`.
- **Une voiture par place.** Les places viennent de la capacité de chaque parking (rangées de 20 : A1 à
  F20 pour 120 places, sans I ni O pour ne pas les confondre avec 1 et 0). L'accueil se voit proposer la
  première place libre ; une place inexistante ou déjà occupée est refusée, et un index unique partiel
  (`parking_id, parking_spot` pour les voitures encore sur place) le garantit même si deux agents donnent
  la même place au même instant (test d'intégration à l'appui).
- **Client sans réservation** : l'accueil l'enregistre en une page (retour, client, plaque, place) ; le
  prix vient de la même fonction que le site, et la place est vérifiée sous le même verrou qu'une
  réservation en ligne : pas de surréservation par l'accueil non plus. Le paiement est noté « sur place »
  (`payment_method`) et confirmé par une case à cocher. L'e-mail est facultatif : l'écran affiche le lien
  personnel du client en QR code, qu'il scanne pour avoir le bouton « J'ai mes bagages ».
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
`SHUTTLE_ACCESS_CODE` (code de la navette), `DESK_ACCESS_CODE` (code de l'accueil), `MANAGER_ACCESS_CODE` (code de la gestion), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

## Tests

```bash
npm test
```

- Tarification (paliers, arrondis, limites, codes promo, prix minimum), validité des codes en jours (heure de Paris)
- Fuseau horaire de Paris (heure d'été, d'hiver, nuit du changement)
- Machine à états du retour
- Code e-mail (format, vérification)
- Nom public des avis (« Sarah M. »)
- Référence et place saisies à l'accueil (format, majuscules, espaces)
- Intégration avec la base : vérification e-mail (mauvais code, blocage après 5 essais), surréservation simultanée, enchaînement de séjours, paiement confirmé une seule fois, annulation du bouton, avis (avant/après prise en charge, un seul), dépôt du véhicule (une seule fois, refusé si non payée), recherche des véhicules sur place, client sans réservation (payé sur place, refusé si complet), places (inexistante, déjà occupée, deux agents en même temps, place proposée), codes promo (remise enregistrée, code expiré refusé, dernière utilisation disputée, création avec validité en jours, doublon refusé, désactivation immédiate, code épuisé)
