# EUROPE 1940 — prosta turowa gra strategiczna w stylu planszówki

## 1. Założenie gry

Europe 1940 to prosta turowa gra strategiczna osadzona w realiach II wojny światowej.

Gra ma przypominać cyfrową planszówkę, a nie rozbudowany symulator wojenny.

Inspiracją jest sposób rozgrywki znany z klasycznych gier typu Warlords:

- mapa składa się z połączonych ze sobą pól,
- najważniejszymi punktami są miasta,
- miasta produkują zasoby i jednostki,
- gracz tworzy armie,
- armie przemieszczają się po mapie,
- miasta można zdobywać,
- zwycięstwo polega na przejęciu kluczowych obszarów przeciwnika.

Najważniejsze założenie:

**Gra musi być łatwa do nauczenia, szybka i czytelna.**

Gracz powinien rozumieć podstawowe zasady po kilku minutach.

Nie należy tworzyć skomplikowanego symulatora podobnego do Hearts of Iron.

---

# 2. Typ gry

Gra:

- turowa,
- strategiczna,
- dla jednego gracza,
- przeciwnikami steruje komputer,
- mapa przedstawia Europę,
- rozgrywka wygląda jak cyfrowa gra planszowa.

Jedna kampania powinna trwać około:

**1–3 godzin.**

Jedna tura odpowiada około:

**2 tygodniom wojny.**

---

# 3. Mapa

Mapa Europy nie jest podzielona na heksy.

Powinna przypominać planszę z punktami połączonymi drogami.

Przykład:

Berlin — Poznań — Warszawa — Brześć — Mińsk — Smoleńsk — Moskwa

Między miastami mogą znajdować się również pola terenowe.

Przykład:

Berlin → równiny → Poznań → rzeka → Warszawa

Mapa powinna mieć około:

**80–120 pól.**

W pierwszym prototypie wystarczy około:

**25–40 pól.**

Każde pole jest połączone z określonymi sąsiednimi polami.

Nie można poruszać się dowolnie.

---

# 4. Rodzaje pól

Na mapie występują:

## Miasto

Najważniejszy rodzaj pola.

Miasto:

- daje zasoby,
- pozwala produkować jednostki,
- może posiadać garnizon,
- jest ważnym punktem zaopatrzenia.

## Równiny

Normalny teren.

Czołgi działają tutaj najlepiej.

## Las

Zapewnia bonus obronny piechocie.

## Góry

Trudny teren.

Zmniejsza możliwość ruchu i daje duży bonus obrońcy.

## Rzeka

Atak przez rzekę daje karę atakującemu.

## Port

Miasto posiadające dostęp do transportu morskiego.

---

# 5. Państwa

Docelowo grywalne mogą być:

- Niemcy,
- ZSRR,
- Wielka Brytania,
- Francja,
- Włochy,
- Polska.

Pozostałe państwa mogą być sterowane przez komputer.

Na początku projektu wystarczą:

**Niemcy oraz ZSRR.**

Każde państwo posiada:

- kolor,
- listę kontrolowanych pól,
- miasta,
- armie,
- zapasy zasobów,
- niewielki bonus narodowy.

Przykład:

Niemcy:
„Blitzkrieg” — jednostki pancerne mają bonus do ruchu.

ZSRR:
„Rezerwy” — piechota kosztuje mniej rekrutów.

---

# 6. Zasoby

W grze występuje 5 zasobów.

## Pieniądze

Symbol:

$

Służą do produkcji i utrzymywania jednostek.

## Stal

Symbol:

STAL

Potrzebna głównie do:

- czołgów,
- artylerii,
- samolotów.

## Ropa

Symbol:

ROPA

Potrzebna do:

- ruchu czołgów,
- lotnictwa,
- jednostek zmotoryzowanych.

## Żywność

Symbol:

ŻYWNOŚĆ

Służy do utrzymania armii.

## Rekruci

Symbol:

REKRUT

Reprezentują dostępnych żołnierzy.

Są potrzebni do tworzenia nowych jednostek.

---

# 7. Produkcja zasobów

Każde miasto daje co turę określoną ilość zasobów.

Przykład:

Warszawa:

- pieniądze: +15
- stal: +5
- ropa: 0
- żywność: +10
- rekruci: +8

Berlin:

- pieniądze: +30
- stal: +20
- ropa: +5
- żywność: +10
- rekruci: +12

Ploeszti:

- pieniądze: +5
- stal: 0
- ropa: +30
- żywność: +5
- rekruci: +3

Dzięki temu poszczególne miasta mają różne znaczenie strategiczne.

---

# 8. Miasta

Każde miasto posiada następujące dane:

- nazwa,
- właściciel,
- poziom produkcji,
- poziom obrony,
- produkcja pieniędzy,
- produkcja stali,
- produkcja ropy,
- produkcja żywności,
- produkcja rekrutów,
- lista produkowanych jednostek.

Przykład:

Warszawa

Właściciel: Polska

Produkcja:
2

Obrona:
3

Dochód:

Pieniądze: 15  
Stal: 5  
Ropa: 0  
Żywność: 10  
Rekruci: 8

---

# 9. Jednostki

Podstawowa wersja gry powinna mieć 6 typów jednostek.

## Piechota

Tania i dobra w obronie.

Statystyki:

Atak: 3  
Obrona: 5  
Ruch: 1  
Zużycie ropy: 0

## Piechota zmotoryzowana

Szybsza piechota.

Atak: 4  
Obrona: 4  
Ruch: 2  
Zużycie ropy: 1

## Czołgi

Najlepsza jednostka ofensywna.

Atak: 7  
Obrona: 5  
Ruch: 2  
Zużycie ropy: 2

## Artyleria

Zapewnia wsparcie podczas ataku.

Atak: 5  
Obrona: 2  
Ruch: 1  
Zużycie ropy: 0

## Działa przeciwpancerne

Silne przeciwko czołgom.

Atak: 3  
Obrona: 4  
Bonus przeciw czołgom: +3  
Ruch: 1

## Myśliwce

Zapewniają wsparcie lotnicze.

Nie poruszają się po mapie jak normalne jednostki.

---

# 10. Armie

Jednostki nie poruszają się pojedynczo.

Gracz łączy je w armie.

Jedna armia może posiadać maksymalnie:

**8 jednostek.**

Przykład armii:

2 × piechota  
3 × czołgi  
1 × artyleria  
1 × działa przeciwpancerne

Cała grupa porusza się jako jeden pionek.

Armia posiada:

- właściciela,
- aktualne pole,
- listę jednostek,
- punkty ruchu,
- status zaopatrzenia,
- opcjonalnego generała.

---

# 11. Ruch

Każda jednostka posiada wartość ruchu.

Armia może poruszać się tylko między połączonymi polami.

Ruch całej armii określa najwolniejsza jednostka.

Przykład:

Piechota ma ruch 1.

Czołg ma ruch 2.

Jeżeli armia zawiera piechotę i czołgi, armia ma ruch 1.

Teren może zmieniać koszt ruchu.

Przykład:

Równiny: 1 punkt ruchu  
Las: 1 punkt ruchu  
Góry: 2 punkty ruchu

---

# 12. Walka

Walka rozpoczyna się, kiedy armia gracza wejdzie na pole zajmowane przez przeciwnika.

Walka jest automatyczna.

Gracz nie steruje jednostkami podczas bitwy.

Podstawowa siła ataku armii to suma wartości ATAK wszystkich jednostek.

Podstawowa siła obrony to suma wartości OBRONA wszystkich jednostek.

Następnie stosowane są modyfikatory.

Przykładowe modyfikatory:

- teren,
- miasto,
- generał,
- artyleria,
- przewaga powietrzna,
- brak zaopatrzenia,
- atak przez rzekę.

Przed atakiem gracz powinien otrzymać przybliżoną informację:

Szansa zwycięstwa:

Wysoka / Średnia / Niska

lub:

75%

Wynik powinien posiadać niewielki element losowy.

Silniejsza armia zazwyczaj wygrywa, ale wynik nie powinien być całkowicie przewidywalny.

---

# 13. Stan jednostki

Każda jednostka ma tylko trzy możliwe stany:

## Pełna sprawność

100% możliwości.

## Uszkodzona

Około 50% wartości bojowej.

## Zniszczona

Jednostka zostaje usunięta.

Nie stosujemy dużej liczby punktów życia.

Ma to przypominać prostą mechanikę planszową.

---

# 14. Zdobywanie miast

Jeżeli armia wejdzie do miasta przeciwnika i pokona jego obrońców:

miasto zmienia właściciela.

Od następnej tury nowy właściciel otrzymuje jego zasoby.

Miasto może przez jedną turę mieć status:

„Chaos po zdobyciu”.

Wtedy produkuje tylko 50% normalnych zasobów.

---

# 15. Zaopatrzenie

Zaopatrzenie jest jedną z najważniejszych mechanik gry.

Armia musi posiadać ciąg połączeń prowadzących do własnego miasta.

Przykład:

Berlin → Poznań → Warszawa → Armia

Jeżeli wszystkie te pola należą do Niemiec, armia jest zaopatrzona.

Jeżeli przeciwnik zdobędzie Poznań:

Berlin → [POZNAŃ ZAJĘTY] → Warszawa → Armia

linia zaopatrzenia zostaje przerwana.

Armia otrzymuje status:

BRAK ZAOPATRZENIA.

---

# 16. Skutki braku zaopatrzenia

Pierwsza tura:

- ruch -1.

Druga tura:

- ruch -1,
- atak -25%,
- obrona -25%.

Trzecia i kolejne:

- ruch maksymalnie 1,
- atak -50%,
- obrona -50%.

Dzięki temu możliwe jest okrążanie armii przeciwnika.

---

# 17. Produkcja jednostek

Jednostki produkuje się w miastach.

Gracz wybiera miasto i jednostkę.

Przykład:

Berlin:

Piechota  
Koszt: 20 pieniędzy + 5 rekrutów  
Czas: 1 tura

Czołgi  
Koszt: 50 pieniędzy + 20 stali + 10 rekrutów  
Czas: 2 tury

Artyleria  
Koszt: 30 pieniędzy + 15 stali + 5 rekrutów  
Czas: 2 tury

Każde miasto posiada limit produkcji.

Przykład:

Produkcja 1:
jedna jednostka jednocześnie.

Produkcja 2:
dwie jednostki jednocześnie.

Produkcja 3:
trzy jednostki jednocześnie.

---

# 18. Lotnictwo

Lotnictwo powinno być uproszczone.

Samoloty stacjonują w miastach.

Każdy samolot ma zasięg, np.:

3 pola.

Gracz nie przesuwa go ręcznie.

Wybiera misję.

## Przewaga powietrzna

Zwiększa szansę zwycięstwa nad wrogimi samolotami.

## Wsparcie wojsk lądowych

Daje bonus własnym armiom.

## Bombardowanie

Osłabia jednostki lub produkcję miasta.

W pierwszym prototypie lotnictwo można całkowicie pominąć.

---

# 19. Generałowie

Generał działa jak bohater w grze Warlords.

Można dołączyć go do jednej armii.

Generał daje prosty bonus.

Przykłady:

Rommel:

+1 ruch dla armii posiadającej minimum 2 jednostki pancerne.

Żukow:

+15% ataku.

Patton:

+1 ruch po wygranej bitwie.

Generałowie nie powinni mieć rozbudowanego systemu RPG.

Maksymalnie trzy poziomy doświadczenia.

---

# 20. Przebieg tury

Tura gracza wygląda następująco.

## Faza 1 — zasoby

Gra automatycznie dodaje zasoby z kontrolowanych miast.

## Faza 2 — produkcja

Kończy się rozpoczęta wcześniej produkcja.

Gracz może zamówić nowe jednostki.

## Faza 3 — ruch

Gracz przesuwa armie.

## Faza 4 — walka

Jeżeli armia wejdzie na pole przeciwnika, następuje bitwa.

## Faza 5 — zaopatrzenie

Gra sprawdza linie zaopatrzenia wszystkich armii.

## Faza 6 — koniec tury

Ruch wykonuje komputer.

---

# 21. Sterowanie

Sterowanie powinno być bardzo proste.

Gracz klika armię.

Gra pokazuje pola, na które może się przesunąć.

Gracz klika docelowe pole.

Armia przesuwa się.

Jeżeli na polu znajduje się przeciwnik:

pojawia się okno:

ATAK

Siły własne: 24  
Siły przeciwnika: około 18

Szansa zwycięstwa: wysoka

[ATAKUJ]

[ANULUJ]

---

# 22. Interfejs

Główny ekran pokazuje mapę Europy.

Na górze ekranu:

Tura: 12

Pieniądze: 240  
Stal: 120  
Ropa: 80  
Żywność: 200  
Rekruci: 90

Na mapie:

- miasta,
- połączenia między polami,
- armie,
- granice państw.

Kliknięcie miasta otwiera panel miasta.

Kliknięcie armii otwiera panel armii.

---

# 23. Wygląd mapy

Mapa powinna przypominać planszową mapę wojenną.

Nie musi być dokładną mapą geograficzną.

Najważniejsza jest czytelność.

Miasta są dużymi punktami.

Połączenia pomiędzy nimi są przedstawione jako linie lub drogi.

Przykład:

[BERLIN]
   |
   |
[POZNAŃ]
   |
   |
[WARSZAWA]
  /      \
ŁÓDŹ     BRZEŚĆ
           |
         MIŃSK

Armie są przedstawione jako prostokątne żetony z:

- flagą państwa,
- liczbą jednostek,
- symbolem dominującego typu jednostki.

---

# 24. AI przeciwnika

AI powinno być proste i przewidywalne logicznie.

Nie musi stosować skomplikowanego uczenia maszynowego.

AI powinno działać według zestawu reguł.

Każdej potencjalnej akcji przypisywana jest wartość punktowa.

---

# 25. Ocena miasta przez AI

AI ocenia każde miasto przeciwnika.

Przykładowy wzór:

WARTOŚĆ CELU =

wartość zasobów  
+ znaczenie strategiczne  
+ bonus za stolicę  
+ bonus za przerwanie zaopatrzenia przeciwnika  
- odległość  
- siła obrońców

AI wybiera miasta z najwyższą wartością.

---

# 26. Priorytety AI

AI powinno wykonywać decyzje w następującej kolejności.

## Priorytet 1

Obrona własnego miasta zagrożonego przez przeciwnika.

## Priorytet 2

Ratowanie armii bez zaopatrzenia.

## Priorytet 3

Atak na słabo bronione miasto.

## Priorytet 4

Atak na ważne miasto gospodarcze.

## Priorytet 5

Próba przecięcia linii zaopatrzenia przeciwnika.

## Priorytet 6

Grupowanie armii przed silnym przeciwnikiem.

---

# 27. Zasady ataku AI

AI nie powinno bezsensownie atakować.

Przykład:

Jeżeli przewidywana szansa zwycięstwa jest mniejsza niż 40%:

nie atakuj.

Jeżeli szansa wynosi 40–60%:

atakuj tylko ważny cel.

Jeżeli szansa wynosi ponad 60%:

atakuj.

Jeżeli ponad 80%:

atak ma wysoki priorytet.

---

# 28. Grupowanie armii przez AI

Jeżeli AI nie ma wystarczającej siły do zdobycia miasta:

powinno przesunąć pobliskie armie w jego kierunku.

Przykład:

Warszawa:

obrona = 30.

Armia A:

siła = 14.

Armia B:

siła = 16.

AI nie atakuje osobno.

Najpierw próbuje zgromadzić obie armie w pobliżu Warszawy.

Następnie wykonuje wspólną ofensywę.

---

# 29. Produkcja AI

AI powinno analizować swoją sytuację.

Podstawowe proporcje:

40% produkcji — piechota  
30% — czołgi  
20% — artyleria  
10% — inne jednostki

Jeżeli AI ma mało ropy:

produkuje mniej czołgów.

Jeżeli traci miasta:

produkuje więcej piechoty.

Jeżeli ma dużo zasobów i przewagę:

produkuje więcej czołgów.

---

# 30. Warunki zwycięstwa

Podstawowy warunek:

zdobycie określonych kluczowych miast przeciwnika.

Przykład kampanii Niemcy kontra ZSRR:

Niemcy wygrywają po zdobyciu:

Moskwy,
Leningradu,
Stalingradu.

ZSRR wygrywa po zdobyciu:

Berlina.

Można również zastosować system punktów zwycięstwa.

Przykład:

Berlin: 10 VP  
Moskwa: 10 VP  
Warszawa: 5 VP  
Kijów: 5 VP  
Bukareszt: 4 VP

Pierwszy gracz posiadający 30 punktów zwycięstwa wygrywa.

---

# 31. Pierwszy prototyp

Pierwsza wersja gry nie powinna obejmować całej Europy.

Należy przygotować mały prototyp.

## Mapa

Obszar:

Niemcy — Polska — zachodnia część ZSRR.

Około:

25–30 pól.

Miasta:

Berlin  
Królewiec  
Poznań  
Warszawa  
Kraków  
Gdańsk  
Brześć  
Wilno  
Mińsk  
Kijów  
Smoleńsk  
Moskwa

oraz kilka pól terenowych.

## Państwa

Tylko:

Niemcy  
ZSRR

## Jednostki

Tylko:

Piechota  
Czołgi  
Artyleria  
Działa przeciwpancerne

Bez:

lotnictwa,
floty,
dyplomacji,
technologii.

---

# 32. Cel pierwszego prototypu

Pierwsza wersja ma sprawdzić wyłącznie cztery główne mechaniki:

1. zdobywanie miast,
2. produkcję jednostek,
3. tworzenie i przemieszczanie armii,
4. przecinanie zaopatrzenia.

Jeżeli te cztery elementy są zabawne, można rozwijać grę.

Nie należy dodawać dodatkowych systemów przed sprawdzeniem podstawowej rozgrywki.

---

# 33. Model danych dla implementacji

Przykładowa struktura pola mapy:

Field:

id  
name  
type  
terrain  
owner  
connections[]  
cityData lub null  
armyId lub null

Przykład:

id: "warsaw"

name: "Warszawa"

type: "city"

terrain: "urban"

owner: "germany"

connections:

- poznan
- krakow
- brest

---

City:

name  
productionSlots  
defenseBonus  
moneyIncome  
steelIncome  
oilIncome  
foodIncome  
manpowerIncome  
productionQueue[]

---

Unit:

id  
type  
owner  
attack  
defense  
movement  
oilConsumption  
state

state:

full  
damaged

---

Army:

id  
owner  
fieldId  
units[]  
movementRemaining  
supplyStatus  
turnsWithoutSupply  
generalId

---

Country:

id  
name  
resources  
controlledFields[]  
armies[]  
cities[]

Resources:

money  
steel  
oil  
food  
manpower

---

# 34. Kolejność implementacji dla AI/programisty

Implementację należy wykonywać etapami.

## Etap 1

Stworzyć mapę jako graf pól.

Każde pole posiada listę sąsiadów.

## Etap 2

Dodać możliwość wyboru armii i przemieszczania jej pomiędzy polami.

## Etap 3

Dodać właścicieli pól i zdobywanie miast.

## Etap 4

Dodać system walki.

## Etap 5

Dodać produkcję zasobów.

## Etap 6

Dodać produkcję jednostek.

## Etap 7

Dodać system zaopatrzenia.

## Etap 8

Dodać podstawowe AI przeciwnika.

## Etap 9

Dodać warunek zwycięstwa i przegranej.

## Etap 10

Dopiero później dodawać:

lotnictwo,
floty,
generałów,
więcej państw,
większą mapę.

---

# 35. Najważniejsza zasada projektu

Każda nowa mechanika musi spełniać pytanie:

„Czy gracz rozumie ją po jednym zdaniu?”

Jeżeli nie, należy ją uprościć.

Gra nie ma symulować całej II wojny światowej.

Ma dawać graczowi uczucie dowodzenia kampanią wojenną za pomocą bardzo prostych decyzji:

**produkuj → grupuj → atakuj → zdobywaj miasta → przecinaj zaopatrzenie → okrążaj przeciwnika.**

To jest główna pętla rozgrywki.
