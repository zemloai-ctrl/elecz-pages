# FI-sivu: Näytä lisää

Pohja: Pages main `1a8e31c3fdb0596681db3b59f7c130130f3d6a84`.
Riippuvuus on jo tuotannossa: Core PR #7, main/live
`d47e3f8780b66fbc1179a8d7c5b8af1b354ef4ed`.

## Käytös

- Jokainen vertailu pyytää `offer_limit=20`. Kulutus/profiili, postinumero ja
  sulake välitetään entiseen tapaan.
- Aluksi näytetään nykyiset kolme tarjousta kummastakin ryhmästä. Ryhmän oma
  ”Näytä lisää” avaa kaikki loput saman vastauksen tarjoukset kerralla,
  enintään 20 per ryhmä. Avattu painike katoaa. Ryhmät toimivat itsenäisesti.
- Painike näkyy vain, jos ryhmässä on yli kolme saatua tarjousta.
- Katkaistun listan laskuri kertoo näkyvän määrän: aluksi esimerkiksi
  ”Näytetään 3 halvinta 53 tarjouksesta”, avaamisen jälkeen sovitusti
  ”Näytetään 20 halvinta 53 tarjouksesta”. N on palvelimen ryhmäkohtainen
  `total_count`, ei kaikkien kantaan tallennettujen tarjousten määrä.
- Kun koko ryhmä mahtuu listalle, laskuri on ”Yhteensä N tarjousta”
  (yhdellä tarjouksella ”Yhteensä 1 tarjous”). Tyhjällä ryhmällä määrä on 0
  ja nykyinen ”Vertailukelpoisia tarjouksia ei löytynyt” -teksti säilyy.
- Lisälistan puuttuessa, unavailable-tilassa tai sen tarkistuksen epäonnistuessa
  säilytetään top 3 ja näytetään ”Lisätarjouksia ei juuri nyt saatavilla”.
  Tällöin ei keksitä kokonaismäärää eikä näytetä lisäpainiketta.
- Uusi kelvollinen vertailuhaku tyhjentää vanhat listat, laskurit, live-tekstit
  ja painikkeiden käsittelijät jo ennen vastauksen saapumista. Uusi tulos alkaa
  kolmesta. Verkkovirhe ei jätä vanhoja tarjouksia tai painikkeita näkyviin.

Lisälista hyväksytään kokonaisuutena. Selain tarkistaa statuksen, rajan,
ryhmät ja laskurit, hintajärjestyksen, top 3:n vastaavuuden, nimet ja
kanonisten tunnisteiden/linkkien johdonmukaisuuden. Selain ei järjestä,
täydennä tai yhdistele tarjouksia. Kunkin uuden kortin muodostus käyttää
nykyistä korttikoodia hinta- ja kampanjajaksoineen, kestotietoineen ja
tarjouslinkkeineen. Puuttuva kanoninen tunniste säilyttää nykyisen suoran
tuotelinkin vaihtoehdon. Verkkokutsu on vain lomakkeen lähetyskäsittelijässä.

## Saavutettavuus

Molemmat ovat tavallisia `type="button"`-painikkeita omilla ryhmän kertovilla
saavutettavilla nimillään, `aria-controls`-kohteella ja `aria-expanded`-tilalla.
Avaus lisää vain uudet kortit; kolmea ensimmäistä ei rakenneta uudestaan.
Fokus siirtyy ensimmäisen uuden kortin h3-otsikkoon (`tabindex=-1`), ja
ryhmän oma polite-live-alue ilmoittaa lisättyjen tarjousten määrän.
Uudet otsikot eivät lisää pysyviä pysähdyksiä Tab-järjestykseen.

## Välimuisti ja rajaus

Worker ei muutu: koko URL on edelleen välimuistiavain. Testi varmistaa, että
`offer_limit=20`, `offer_limit=3` ja puuttuva raja välitetään Corelle ja pysyvät
eri välimuistivastauksina. Postinumero-, kulutus/profiili- ja sulake-erottelu
säilyy. Painikkeesta ei lähde uutta HTTP-kutsua tai vertailupäätöstä.

Contracts, Core ja MCP eivät muutu tässä PR:ssä. Sulakkeen siirto,
lomakkeen leveydet, ohjetekstien karsiminen ja takaisin-painikkeen
asumismuototilan korjaus kuuluvat seuraavaan erilliseen Pages-PR:ään.

## Testaus

```sh
node --test tests/fi-more-offers.cjs tests/fi-housing-profiles.cjs \
  tests/fi-postcode.cjs tests/fi-main-fuse.cjs tests/fi-comparison-links.cjs \
  tests/fi-price-periods.cjs tests/worker-go-redirects.cjs
node --check fi/sahkosopimukset/comparison.js
git diff --check
```

48 uutta testiä: 0/1/2/3/4/12/19/20/21/137 tarjouksen ryhmät, molemmat
painikkeet, laskurit, ensimmäisen uuden otsikon fokus, yksi HTTP-haku,
nollaus keskeneräisen uuden haun aikana, epäkelpo lisälista, verkkovirhe,
tasahinnat, saman yhtiön eri tuotteet, suorat linkit ja saavutettava HTML.
Vanhat 28 asumismuototestiä sekä postinumero-, sulake-, linkki-, hintajakso-
ja redirect-testit ajetaan mukana. Vanhojen testien odotettuihin URL:eihin
on lisätty sovittu `offer_limit=20`.

Tuotanto-Coresta talletettu muokkaamaton vastaus voidaan syöttää näin:

```sh
QUERY='consumption=6000' node tests/fi-more-offers.cjs --core-response < response.json
```

Tämä tarkistus ajettiin kahdeksalla Core-julkaisussa varmennetulla vastauksella:
oma luku, tyhjä lomake, sähkölämmitysoletus, neljä asumismuotoarviota ja
postinumero 67100 / sulake 3×35 A. Se avaa molemmat listat ja varmistaa
korttien järjestyksen, nimet, linkit, fokuksen, laskurit ja yhden verkkokutsun.
Samoilla vastauksilla ajettiin myös vanhat Core-kulutus- ja kestotarkistukset.

## Selainkoe

Chrome, paikallinen esikatselu tuotanto-Coresta talletetuilla vastauksilla.
390 ja 1440 CSS-px:n iframe-näkymät: mobiilissa yksi palsta, työpöydällä
kaksi. Sivun sisäinen `scrollWidth` vastaa `clientWidth`-arvoa; sivusuuntaista
ylivuotoa ei havaittu. Kyse on responsiivisen näkymän testistä, ei fyysisestä
puhelimesta. Leveän testikehyksen mahdollinen ulompi vierityspalkki kuuluu
QA-kuoreen, ei vertailusivuun.

Selaimessa tarkistettiin top 3, ryhmien itsenäinen 3 → 20 -avaus Enterillä,
Tab-siirtymä kolmannen tarjouslinkin jälkeen painikkeeseen, fokus uuden
neljännen kortin otsikossa, piiloutuvat painikkeet ja uuden haun palautus
kolmeen. Lisälistan unavailable-tilassa jäi 3 + 3 ja sovittu ilmoitus.
Lyhyillä 7 + 4 listoilla kokonaismäärät näkyivät ja kaikki loput avautuivat.
Esikatselupalvelimen API-loki pysyi samassa neljässä haussa, kun molemmat
työpöydän painikkeet avattiin; avaus ei tehnyt uutta verkkokutsua myöskään
oikeassa selaimessa. Kuvat toimitetaan katselmointiviestissä.

## Julkaisu

PR katselmoidaan ennen mergeä. Haaran commit alkaa `[CF-Pages-Skip]`, jotta
Cloudflaren automaattinen esikatselujulkaisu ei käynnisty tästä PR-työstä.
Merge ja tuotantojulkaisu vaativat erillisen luvan. Käytä silloin tavallista
merge-committia ilman skip-etuliitettä, **ei squashia**. Julkaisun jälkeen
varmistetaan tuotantocommit ja listojen toiminta elävältä sivulta.
