# Threads Saver — teknik, güvenlik, performans, hukuk ve ürün raporu

**İnceleme tarihi:** 31 Temmuz 2026
**İncelenen sürüm:** `1.0.3`
**Kapsam:** `src/`, derlenmiş `main.js`, manifest, bağımlılıklar, stiller, README, iOS Shortcut rehberi ve yayın hazırlığı
**Not:** Bu bölüm hukuki danışmanlık değil, ürün ve risk değerlendirmesidir. Yayına çıkmadan önce özellikle Meta şartları ve telif kapsamı için bilişim/fikri mülkiyet alanında çalışan bir hukukçudan görüş alınmalıdır.

> [!IMPORTANT]
> **Uygulama güncellemesi — sürüm 1.1.0:** Bu raporun bulguları incelenen `1.0.3` sürümünün tarihsel fotoğrafıdır. Rapor sonrasında kodlanan `1.1.0`; tam host/HTTPS URL doğrulaması, Secret Storage migration'ı, bağlama göre HTML/Markdown/YAML kaçışlama, güvenli dosya güncelleme işaretleri, kasa yol doğrulaması, medya host/MIME/adet/boyut/eşzamanlılık limitleri, sınırlı JSON taraması, doğru editör aralığı değişimi, güncel bağımlılıklar, lint/CI ve regresyon testlerini içerir. Ayrıca istenen Instagram post/carousel/Reel desteği ile platforma özel klasör/tek dosya hedefleri eklenmiştir.
>
> Otomatik `npm run check` ve `npm audit` başarılıdır. Buna rağmen gerçek Threads/Instagram sayfaları, iOS/Android cihazları ve Meta'nın değişken erişim davranışı üzerinde manuel smoke test henüz kullanıcı tarafından yapılmalıdır. Authenticated web extraction için rapordaki Meta şartları riski teknik düzeltmeyle ortadan kalkmaz; genel yayın öncesi açık bir hukuk/ürün go-no-go kararı gerekir.

## 1. Yönetici özeti

Ürünün temel fikri güçlü: Threads'te bulunan değerli içeriği mobil veya masaüstünden, kullanıcının kendi Obsidian kasasına Markdown olarak aktarmak. Kod küçük, anlaşılabilir ve dış çalışma zamanı bağımlılığı taşımıyor. Yerel medya indirme, özel şablon, thread açma ve iOS Shortcut desteği iyi bir MVP tabanı oluşturuyor.

Ancak mevcut sürüm **genel kullanıma veya Obsidian Community Plugins dizinine gönderilmeye hazır değil**.

En önemli engel: dışarıdan çağrılabilen Obsidian deep link'i, gerçek istek alan adını kesin olarak doğrulamıyor. Kötü hazırlanmış bir deep link, kullanıcının `sessionid` çerezinin saldırganın sunucusuna gönderilmesine neden olabilir.

Bu kritik sorun giderilmeden eklenti tanıtılmamalı ve gerçek kasalarda kullanılmamalı. Ardından sırayla gizli bilginin saklanması, içerik kaçışlama, medya indirme limitleri, dosya üzerine yazma koruması ve Meta kullanım şartları ele alınmalı.

İnceleme sırasında repoya gelen `f922c30` commit'i, daha önce var olan kasa çapında `create/modify` dinleyicisini ve kısa notları kalıcı silen otomatik zenginleştirme akışını kaldırdı. Bu önemli veri kaybı riski güncel HEAD'de çözülmüş görünüyor ve raporda “kapatılan bulgu” olarak ayrıca kaydedildi.

### Genel puan

| Alan | Puan | Kısa değerlendirme |
|---|---:|---|
| Ürün fikri / problem uyumu | 8/10 | Gerçek ve büyüyen bir “kaydet ama sonra bulama” problemini çözüyor. |
| Kod okunabilirliği | 7/10 | Küçük ve modüler; test ve sağlam veri modeli eksik. |
| Güvenlik | 3/10 | İki kritik risk ve birkaç yüksek risk var. |
| Veri bütünlüğü | 5/10 | Kalıcı silme akışı kaldırıldı; sessiz üzerine yazma riski devam ediyor. |
| Performans | 7/10 | Kasa çapında dinleyici kaldırıldı; ağ ve parse limitleri hâlâ eksik. |
| Mobil deneyim | 7/10 | iOS akışı güçlü; Android tek dokunuş değil ve dokümantasyonda doğru şekilde sınırlandırılmış. |
| Hukuki/politika hazırlığı | 4/10 | Disclaimer var; fakat authenticated scraping ciddi sözleşmesel risk yaratıyor. |
| Yayın hazırlığı | 4/10 | Bundle oluşuyor; tip kontrolü, bağımlılıklar, testler ve yayın dosyaları eksik. |

## 2. Mimari ve veri akışı

Eklenti şu akışlarla Threads URL'si alıyor:

- Pano okuma ve odaklanınca otomatik algılama
- Komut paleti
- Editör bağlam menüsü
- Aktif nottaki tüm Threads bağlantılarını işleme
- `obsidian://threads-saver?url=...` protokolü

URL alındıktan sonra:

1. Threads sayfasına `requestUrl()` ile HTTP isteği yapılıyor.
2. Ayarlarda varsa `sessionid` isteğin `Cookie` başlığına ekleniyor.
3. Open Graph alanları ve sayfadaki JSON script blokları ayrıştırılıyor.
4. Gönderi metni, görseller ve aynı yazara ait olduğu varsayılan cevap zinciri çıkarılıyor.
5. Medya isteğe göre yerel kasaya indiriliyor.
6. Şablondan Markdown/YAML/ham HTML oluşturuluyor.
7. Dosya varsa üzerine yazılıyor, yoksa oluşturuluyor.

Veri geliştirici sunucusuna gönderilmiyor; ancak Threads alan adlarına, Meta/Instagram CDN'lerine ve notta uzaktan medya bırakılırsa görüntü açıldığında ilgili uzak sunuculara ağ istekleri yapılabiliyor.

## 3. Kritik ve yüksek öncelikli teknik bulgular

### CRITICAL-01 — Deep link üzerinden `sessionid` çerezi dışarı sızabilir

**Kod:** [`src/main.ts`](src/main.ts#L79), [`src/parser.ts`](src/parser.ts#L7), [`src/parser.ts`](src/parser.ts#L64)

`extractThreadsPostId()` ve `isThreadsUrl()` bir URL nesnesinin gerçek host'unu doğrulamak yerine metin içinde `threads.com/...` parçası arıyor. `parseThreadsPost()` ise doğrulamadan sonra eşleşen parçayı değil, kendisine verilen orijinal metnin tamamını `targetUrl` olarak kullanıyor ve `Cookie` başlığını bu isteğe ekliyor.

Doğrulama testinde aşağıdaki değer hem geçerli sayıldı hem de post kimliği çıkarıldı:

```text
https://evil.example/redirect/https://www.threads.com/@alice/post/ABC
```

Gerçek istek host'u `evil.example` olur. Bu değer dışarıdan `obsidian://threads-saver?url=...` ile verilebildiği için teorik değil, erişilebilir bir saldırı yüzeyidir.

**Etki:** Threads/Instagram oturumunun ele geçirilmesi, hesap erişimi ve kullanıcının Meta hesabında kötüye kullanım.

**Düzeltme:**

- Girdi önce `new URL()` ile ayrıştırılmalı.
- Yalnızca `https:` kabul edilmeli.
- Host tam eşleşmeyle `threads.net`, `www.threads.net`, `threads.com`, `www.threads.com` olmalı.
- Port ve `username:password@host` bölümü reddedilmeli.
- İstek URL'si ham girdiden değil, doğrulanmış bileşenlerden yeniden oluşturulmalı.
- Çerez yalnızca bu allowlist doğrulamasından sonra eklenmeli.
- Deep link testleri kötü host, alt alan adı, userinfo, encoded karakter, yeni satır ve redirect senaryolarını kapsamalı.
- En güvenli seçenek, kullanıcıdan web oturum çerezi istemeyi tamamen kaldırmaktır.

### HIGH-01 — Oturum çerezi düz metin saklanıyor ve ayarda açıkça gösteriliyor

**Kod:** [`src/settings.ts`](src/settings.ts#L19), [`src/main.ts`](src/main.ts#L135), [`src/types.ts`](src/types.ts#L34)

`sessionid`, normal metin alanında gösteriliyor ve `saveData()` ile eklenti verisine kaydediliyor. Bu veri `.obsidian/plugins/.../data.json` altında kalabilir; kasa yedekleme, Git veya ayar senkronizasyonuyla başka cihazlara/kişilere taşınabilir.

README'deki “session cookies ... stored değil” ifadesi de yerel saklama davranışıyla çelişiyor.

**Düzeltme:**

- Tercihen çerez tabanlı akışı kaldırıp izinli/official API akışına geçin.
- Çerez kalacaksa Obsidian 1.11.4+ `SecretStorage` kullanın ve `minAppVersion` değerini buna göre yükseltin.
- Alanı `password` tipinde gösterin; açık “göster” kontrolü ekleyin.
- Ekranda çerezin hesap parolası kadar hassas olduğunu ve senkronize edilmemesi gerektiğini anlatın.
- Eski `data.json` değerini güvenli alana taşıyan ve düz metni silen migration yazın.

### HIGH-02 — Uzak içerik HTML, Markdown ve YAML içine kaçışlanmadan yazılıyor

**Kod:** [`src/downloader.ts`](src/downloader.ts#L117), [`src/downloader.ts`](src/downloader.ts#L214), [`src/types.ts`](src/types.ts#L38)

Yazar adı, gönderi metni ve URL:

- Ham HTML kartın içine,
- Markdown quote/link alanlarına,
- YAML frontmatter içine

kaçışlanmadan yazılıyor. Threads'ten gelen içerik HTML etiketi, Markdown bağlantısı veya YAML kapatma karakterleri taşıyabilir. Obsidian bazı tehlikeli HTML'leri sanitize etse bile bu davranışa güvenmek doğru bir güvenlik sınırı değildir; en azından not görünümü bozulabilir, sahte bağlantı/arayüz üretilebilir ve frontmatter geçersiz hale gelebilir.

**Düzeltme:**

- HTML için `& < > " '` kaçışlaması kullanın.
- Markdown metni ve URL'lerini bağlama göre kaçışlayın.
- YAML'ı elle string birleştirerek üretmeyin; güvenilir serializer veya `FileManager.processFrontMatter()` kullanın.
- Visual card mümkünse ham HTML yerine güvenli bir code block renderer ile oluşturulsun.
- Kötü amaçlı yazar adı, çok satırlı metin, `---`, `]]`, `</div>` ve HTML entity testleri ekleyin.

### HIGH-03 — Medya indirmede host, tip, boyut ve adet sınırı yok

**Kod:** [`src/parser.ts`](src/parser.ts#L141), [`src/downloader.ts`](src/downloader.ts#L20)

Sayfadaki JSON/OG alanlarından çıkarılan URL'ler doğrudan indiriliyor. Yalnızca birkaç avatar paterni filtreleniyor. `https` zorunluluğu, güvenilir CDN allowlist'i, `Content-Type`, `Content-Length`, toplam medya sayısı ve toplam byte sınırı yok. Yanıt tamamen belleğe alındıktan sonra kasaya yazılıyor.

**Etki:** Yerel ağ/istenmeyen host istekleri, çok büyük dosya nedeniyle bellek/disk tüketimi, yanlış uzantılı içerik ve yavaş arayüz.

**Düzeltme:**

- Yalnızca `https` ve doğrulanmış Meta CDN host'ları.
- En fazla örneğin 10 medya, dosya başına 20 MB, toplam 100 MB gibi kullanıcıya gösterilen limitler.
- Yanıt `Content-Type` allowlist'i: `image/jpeg`, `image/png`, `image/webp`, desteklenecekse kontrollü video tipleri.
- Dosya uzantısını URL'den değil doğrulanmış MIME tipinden üretin.
- İndirme öncesi kullanıcıya toplam boyut/medya sayısı gösterin veya güvenli varsayılan uygulayın.
- Eşzamanlılık 2–3 ile sınırlı kontrollü paralel indirme ve iptal desteği.

### HIGH-04 — Aynı dosya adı mevcutsa içeriği sessizce değiştiriliyor

**Kod:** [`src/downloader.ts`](src/downloader.ts#L247)

Başlık şablonu özelleştirilebiliyor. Aynı başlığa sahip mevcut dosya bulunduğunda bunun eklenti tarafından oluşturulmuş aynı gönderi olup olmadığı kontrol edilmeden dosyanın tamamı değiştiriliyor. Kullanıcı `{{id}}` alanını şablondan kaldırırsa farklı postlar aynı dosyaya düşebilir.

**Düzeltme:**

- Her dosyada sabit `threads_post_id` ve `source` frontmatter alanı tutun.
- Yalnızca bu kimlik eşleşirse güncelleyin.
- Başka dosya varsa `- 2`, tarih veya kısa hash ekleyin.
- Güncelleme öncesi isteğe bağlı diff/confirmation sunun.
- Başlık boş kalırsa güvenli bir fallback kullanın.

## 4. Orta ve düşük öncelikli bulgular

### RESOLVED-01 — Kasa çapında dinleme ve kalıcı kısa-not silme kaldırıldı

Önceki `b9b7e57` durumunda otomatik zenginleştirme tüm Markdown `create/modify` olaylarını dinliyor, üç satır veya daha kısa bir notu geçici paylaşım dosyası sayabiliyor ve `Vault.delete()` ile kalıcı silebiliyordu.

İnceleme sırasında gelen `f922c30` commit'i:

- Kasa çapındaki `create/modify` dinleyicilerini,
- `autoEnrichShareSheetLinks` ayarını,
- `processingFiles` durumunu,
- Otomatik `Vault.delete()` çağrısını

kaldırdı. Yerine kullanıcı tarafından açıkça çalıştırılan toplu inbox işleme komutu getirildi. Bu değişiklik hem veri kaybı hem büyük kasalarda performans riskini önemli ölçüde azaltıyor.

**Regresyon önerisi:** CI testinde eklentinin hiçbir normal iş akışında `Vault.delete()` çağırmadığını ve kısa kullanıcı notlarının değişmeden kaldığını doğrulayın.

### MEDIUM-01 — Kısa `/t/` ve `/share/` URL'lerinde “aynı yazar” filtresi güvenilir değil

**Kod:** [`src/parser.ts`](src/parser.ts#L115), [`src/parser.ts`](src/parser.ts#L240)

Bu URL biçimlerinde kullanıcı adı URL'den çıkmıyor. Kod JSON içinden ana gönderinin yazarını güvenilir biçimde atamıyor; `mainAuthorUsername` boş olduğunda cevap filtresi bütün kullanıcıların cevaplarını kabul edebiliyor. Bu, “yalnızca aynı yazarın zinciri” ürün iddiasını bozuyor.

**Öneri:** Önce root post nesnesini kesin olarak bulun, root author ID/username çıkarın, cevapları kullanıcı ID'si ile filtreleyin. Kimlik bulunamazsa unroll yapmayın.

### MEDIUM-02 — Unroll kapalıyken cevap medyaları yine indirilebiliyor

**Kod:** [`src/downloader.ts`](src/downloader.ts#L56), [`src/downloader.ts`](src/downloader.ts#L168)

`unrollThreadChain` görünür metni kontrol ediyor; fakat `downloadMediaLocally()` cevap zincirinin medyalarını ayar kapalıyken de işleyebiliyor.

**Öneri:** Ayar parser aşamasından indirme aşamasına kadar tek bir davranış sözleşmesi olarak taşınmalı.

### MEDIUM-03 — JSON taraması kırılgan ve gereksiz veriyi toplayabilir

**Kod:** [`src/parser.ts`](src/parser.ts#L152), [`src/parser.ts`](src/parser.ts#L193)

Tipi belirsiz JSON ağacı recursive olarak geziliyor. Derinlik/boyut sınırı, şema doğrulama, node sayısı sınırı ve döngü koruması yok. JSON.parse sonucu döngüsel olmasa da büyük/derin payload stack taşmasına veya fazla CPU kullanımına yol açabilir. Genel `image_versions2` taraması ilgili olmayan görselleri de alabilir.

**Öneri:** Bilinen veri yolları ve şema doğrulama; maksimum script boyutu, maksimum derinlik ve maksimum medya adedi.

### MEDIUM-04 — Tip kontrolü başarısız

`npm run build` başarılı oldu, fakat `tsc --noEmit` güncel kurulumda üç `HistoryHandler` tip hatasıyla başarısız oldu. Kaynak kodun önceki public olmayan `getUnpackagedLeaf` kullanımı eşzamanlı çalışma ağacı değişikliğinde `getLeaf(false)` ile düzeltilmiş durumda.

**Öneri:** `obsidian`, TypeScript ve `@types/node` sürümlerini birlikte pinleyin; güncel sample plugin yapılandırmasına geçin; CI'da build + typecheck + lint + test zorunlu olsun. `obsidian: "latest"` tekrarlanabilir yapı üretmez.

### MEDIUM-05 — Lockfile ve package manifest tutarsız

- `package.json`: sürüm `1.0.3`, `builtin-modules: ^3.3.0`
- `package-lock.json` root: sürüm `1.0.0`, `builtin-modules: ^5.3.0`
- `npm ls --all`: `builtin-modules@5.3.0 invalid`

**Öneri:** Node sürümünü belirtin, temiz kurulumla lockfile'ı yeniden üretin ve `npm ci` testini CI'a ekleyin.

### MEDIUM-06 — Eski esbuild sürümünde bilinen geliştirme sunucusu açığı var

`npm audit`, `esbuild@0.19.11` için **moderate** seviye `GHSA-67mh-4wv8-2f99` buldu. Açık geliştirme sunucusunun CORS davranışıyla ilgili; paket yalnızca dev dependency ve mevcut config `serve()` kullanmıyor. Bu nedenle son kullanıcı bundle'ı için doğrudan sömürülebilir görünmüyor, fakat geliştirme zinciri güncellenmeli.

**Öneri:** esbuild `>=0.25.0` uyumluluğunu test ederek yükseltin.

### MEDIUM-07 — Aktif editörde bağlam menüsü her zaman linki değiştirmiyor

**Kod:** [`src/main.ts`](src/main.ts#L65), [`src/main.ts`](src/main.ts#L278)

Seçim yoksa kod cursor satırında URL buluyor; fakat `editor.replaceSelection(content)` boş seçime ekleme yapar. Satırdaki URL yerinde kalabilir.

**Öneri:** URL'nin `from/to` konumunu bulun ve `editor.replaceRange()` kullanın.

### LOW-01 — README gizlilik açıklaması gerçeği tam yansıtmıyor

**Kod:** [`README.md`](README.md#L92)

“Tüm istekler doğrudan threads.net/threads.com'a gider” ifadesi medya CDN isteklerini ve uzaktan gömülü medyayı kapsamıyor. “Session cookie stored değil” ifadesi de `saveData()` ile çelişiyor.

**Öneri:** Şunları ayrı ayrı açıklayın:

- Tam olarak hangi alan adlarına neden istek yapıldığı
- Çerezin nerede ve ne kadar süre saklandığı
- Pano okumanın ne zaman yapıldığı
- Hangi verinin kasaya yazıldığı
- Uzaktan medya ile yerel medya arasındaki mahremiyet farkı
- Geliştirici sunucusu/telemetri olmadığı

### LOW-02 — Obsidian inceleme stiliyle uyumsuzluklar

- Settings ekranında `<h2>` kullanılıyor; rehber `Setting(...).setHeading()` öneriyor.
- Arayüz metinleri Title Case; Obsidian rehberi sentence case istiyor.
- Üretimde gereksiz yükleme/boşaltma `console.log` kayıtları var.
- `versions.json`, lint ve test yapılandırması yok.

Bunlar güvenlik açığı değil, Community Plugin incelemesinde geri bildirim alma ihtimali yüksek yayın kalitesi sorunlarıdır.

## 5. Güvenlik açısından olumlu noktalar

- Çalışma zamanı için üçüncü taraf npm kütüphanesi bundle'a alınmıyor.
- `eval`, `new Function`, Node `fs`, `child_process` veya Electron kullanımı yok.
- Mobil uyum için Obsidian `requestUrl` ve Vault API kullanılıyor.
- DOM bildirimleri `createEl/createDiv/setText` ile güvenli şekilde oluşturuluyor.
- Event bus dinleyicileri `registerEvent` ile kaydediliyor; window focus dinleyicisi unload'da kaldırılıyor.
- Telemetri veya geliştirici sunucusu bulunmuyor.
- MIT lisansı ve açık kaynak kod mevcut.
- Güncellenen Android dokümantasyonu, platformun gerçek sınırlamasını artık doğru anlatıyor.
- Kasa çapında otomatik izleme ve kalıcı silme akışı `f922c30` ile kaldırılmış.

## 6. Performans değerlendirmesi

### Bugünkü darboğazlar

1. **Seri medya indirme:** Çok görselli postlarda yavaş; kullanıcı iptal edemiyor.
2. **Büyük HTML/JSON parse:** Yanıt boyutu limiti yok ve bütün DOM bellekte oluşturuluyor.
3. **Recursive genel JSON gezisi:** İlgisiz ağaçları da dolaşabiliyor.
4. **Toplu işlem seri:** Güvenli ama yavaş; ilerleme bildirimi eklenmiş olması olumlu.
5. **Toplu metin değiştirme:** Her başarılı URL için not içeriğinde tekrar replace/split yapılıyor; çok büyük inbox notlarında yaklaşık `URL sayısı × not boyutu` maliyeti oluşuyor.

### Önerilen performans bütçeleri

- HTML yanıtı: en fazla 5–10 MB
- JSON script: blok başına en fazla 2 MB
- Post başına medya: varsayılan en fazla 10
- Dosya başına medya: 20 MB
- Toplam medya: 100 MB
- Paralel medya isteği: 2 veya 3
- Ağ timeout: 15–20 saniye, kullanıcı iptali

## 7. Hukuki ve platform politikası değerlendirmesi

### 7.1 Meta/Instagram/Threads kullanım şartları — yüksek risk

Mevcut eklenti, kullanıcının oturum çerezini alıp Threads web sayfasını otomatik olarak indiriyor ve gömülü JSON'u ayrıştırıyor. Instagram'ın güncel kullanım şartları, açık izin olmadan giriş yapılmış olsun veya olmasın otomatik yöntemlerle bilgiye erişmeyi/toplamayı yasaklıyor. Meta'nın Automated Data Collection Terms'i de önceden açık yazılı izin veya açık yetkilendirme gerektiriyor.

Bu nedenle README'ye “kişisel kullanım” yazılması sözleşmesel riski ortadan kaldırmaz. Olası sonuçlar:

- Kullanıcının hesabının scraping şüphesiyle kısıtlanması
- Meta'dan kaldırma talebi
- Eklentinin Obsidian dizini incelemesinde ek açıklama/güvenlik sorusu
- Ticari kullanım veya ölçekli toplamada daha yüksek risk

**Öneri:** Resmî Threads API'nin izin verdiği kullanım alanlarını doğrulayın ve mümkün olan akışları OAuth/API'ye taşıyın. API'nin desteklemediği “herhangi bir public URL'yi arşivleme” özelliği için yazılı Meta izni olmadan authenticated scraping'i üretim özelliği olarak sunmayın.

Kaynaklar:

- [Instagram Terms of Use — otomatik erişim/toplama yasağı](https://www.facebook.com/help/instagram/581066165581870)
- [Meta Automated Data Collection Terms](https://www.facebook.com/legal/automated_data_collection_terms)
- [Meta Threads API dokümantasyonu (resmî Postman workspace)](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)

### 7.2 Telif hakkı — kişisel arşiv için savunulabilir, dağıtım için riskli

Eklenti yalnızca bağlantı veya kısa alıntı değil; gönderinin tam metnini ve görsellerini çoğaltabiliyor. Türkiye FSEK m.38, kâr amacı gütmeden şahsen kullanım için çoğaltmaya izin verir; fakat bu çoğaltma hak sahibinin meşru menfaatlerine zarar vermemeli veya eserin normal kullanımına aykırı olmamalıdır. Bu sınır olaya göre değişir.

Dolayısıyla:

- Kullanıcının özel kasasında sınırlı kişisel arşiv en savunulabilir senaryodur.
- Takım kasası, kamuya açık Publish sitesi, arşivlerin yeniden paylaşımı, ücretli veri seti veya toplu scraping daha risklidir.
- Kaynak ve yazar belirtmek gereklidir ama tek başına izin yerine geçmez.
- Silinen/özel hale gelen gönderinin tam kopyasını yeniden yayımlamak ayrıca risklidir.

Ürün içinde “yalnızca kişisel kullanım”, “paylaşmadan önce hakları kontrol edin” ve `link-only / excerpt / full archive` modları sunulmalı. Varsayılanın kısa alıntı + kaynak linki olması hukuki riski azaltır.

Kaynaklar:

- [WIPO Lex — 5846 sayılı FSEK, m.22 ve m.38](https://www.wipo.int/wipolex/en/legislation/details/17020)
- [Meta'nın Instagram/Threads telif açıklaması](https://www.facebook.com/help/354736791367645/)

### 7.3 KVKK/GDPR ve gizlilik

Yazar adı, kullanıcı adı, metin, görsel ve gönderi bağlantısı gerçek kişiyle ilişkilendirilebildiğinde kişisel veri olabilir. Eklentinin geliştirici sunucusuna veri göndermemesi önemli bir avantajdır. Salt yerel, bireysel kullanımda geliştiricinin veri sorumlusu rolü sınırlı olabilir; ancak şirket/ajans/araştırma ekibi bu aracı kullanıyorsa işleme amaç ve araçlarını belirleyen kullanıcı kuruluş veri sorumlusu olabilir.

Kurumsal kullanım için gerekli ürün yetenekleri:

- Açık saklama süresi ve toplu silme
- Kaynağa göre silme / “right to erasure” iş akışı
- Export ve veri envanteri
- Özel hesap içeriğini reddetme
- Hassas içerik ve çocuk verisi uyarısı
- Uzak medya yerine yerel medya seçiminin mahremiyet açıklaması
- Oturum çerezi için uygun teknik güvenlik

KVKK, veri sorumlusunun kimliği, amaç, aktarım, yöntem/hukuki sebep ve ilgili kişi hakları hakkında aydınlatma bekler; ayrıca hukuka aykırı erişimi önleyecek teknik/idari tedbirler ister.

Kaynaklar:

- [KVKK — Veri sorumlusu kimdir?](https://www.kvkk.gov.tr/Icerik/2032/Veri-Sorumlusu-Kimdir)
- [KVKK — Aydınlatma yükümlülüğü](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-)
- [KVKK — Veri güvenliğine ilişkin yükümlülükler](https://www.kvkk.gov.tr/Icerik/2040/Veri-Guvenligine-Iliskin-Yukumlulukler)

### 7.4 Marka kullanımı

README'deki bağımsızlık/trademark disclaimer olumlu. Buna rağmen:

- “Threads Saver” adı birinci taraf izlenimi verebilir.
- “native Threads UI” ifadesi ve Threads rozeti görsel yakınlık oluşturuyor.
- Meta/Threads logosu eklenmemeli.

Daha güvenli adlandırma seçenekleri:

- **Saver for Threads — Unofficial**
- **Threadmark for Obsidian**
- **Local Threads Archive**

Obsidian da topluluk eklentilerinin markayı birinci taraf sanılacak biçimde kullanmamasını istiyor.

Kaynaklar:

- [Obsidian Developer Policies](https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/master/en/Developer%20policies.md)
- [Meta Terms — marka ve fikri mülkiyet sınırları](https://www.facebook.com/terms)

### 7.5 Obsidian Community Plugin politikası

Olumlu taraflar: açık kaynak, LICENSE, README ve manifest var; telemetri yok.

Eksik/iyileştirilecek taraflar:

- README ağ kullanımını ve uzak servisleri eksiksiz açıklamalı.
- Gizli bilgi saklama davranışı doğru yazılmalı.
- Yayın tag'i manifest sürümüyle aynı olmalı ve release'e `main.js`, `manifest.json`, `styles.css` eklenmeli.
- Güncel sample plugin akışındaki `versions.json`, lint ve CI düzeni benimsenmeli.
- Güvenlik ve veri kaybı sorunları otomatik incelemeden önce çözülmeli.

Kaynaklar:

- [Obsidian Developer Policies — disclosures](https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/master/en/Developer%20policies.md)
- [Obsidian Plugin Guidelines](https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/master/en/Plugins/Releasing/Plugin%20guidelines.md)
- [Submission requirements](https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/master/en/Plugins/Releasing/Submission%20requirements%20for%20plugins.md)
- [Submit your plugin](https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/master/en/Plugins/Releasing/Submit%20your%20plugin.md)

## 8. Pazar, rakipler ve hedef kullanıcı

Meta, Haziran 2026'da Threads'in **500 milyon aylık aktif kullanıcıya** ulaştığını açıkladı. Aynı zamanda kullanıcı araştırması sinyalleri, yerleşik “Saved” özelliğinin hızlı bookmark için yeterli olsa da yerel, aranabilir, kategorili ve not eklenebilir bir arşiv ihtiyacını karşılamadığını gösteriyor.

Kaynaklar:

- [Meta — Threads 500 milyon aylık aktif kullanıcı](https://about.fb.com/news/2026/06/meta-launching-new-features-500-million-monthly-threads-users/)
- [Kullanıcı tartışması — yerel, aranabilir Threads arşivi ihtiyacı](https://www.reddit.com/r/ThreadsApp/comments/1svrl7e/how_do_you_organize_posts_you_want_to_revisit_on/)

### En güçlü ideal müşteri profili

**Birincil ICP:** Threads'i aktif kullanan, Obsidian'da içerik araştırması yapan bağımsız içerik üreticisi, sosyal medya yöneticisi veya küçük ajans çalışanı.

Ortak özellikleri:

- Haftada 10+ post kaydediyor.
- “Swipe file” veya içerik fikir havuzu tutuyor.
- Mobilde keşfedip masaüstünde üretiyor.
- Kaynak metni, görseli, yazar ve linki birlikte saklamak istiyor.
- Bulut hesabı veya başka bir abonelik yerine kendi kasasını tercih ediyor.

**Çözdüğü ana iş:** “Threads'te gördüğüm fikri kaybetmeden, bağlamı ve kaynağıyla içerik üretim sistemime al.”

### İkinci güçlü segment

**Araştırmacı, gazeteci, analist ve akademisyenler.**

Onlar için asıl değer:

- Kaynağı ve erişim tarihini korumak
- Silinebilen sosyal içerik için kişisel araştırma kopyası
- Full-text arama, etiket ve bağlantılar
- Thread zincirini tek notta okumak

Bu segmentte provenance, hash, orijinal tarih, alıntı modu ve hukuki kontroller; görsel karttan daha önemlidir.

### Üçüncü segment

**PKM/second-brain meraklıları ve yoğun mobil kullanıcılar.**

Sorunları “saved posts mezarlığı”: farklı uygulamalarda dağınık bookmark'lar, ekran görüntüleri ve sonra bulunamayan fikirler. Bu segment sayıca büyük fakat ödeme isteği ve kullanım sıklığı ilk iki segmentten daha düşük olabilir.

### Rakip görünümü

| Ürün | Güçlü tarafı | Zayıf tarafı / fırsat |
|---|---|---|
| Threads'in yerleşik Saved özelliği | Sıfır kurulum, mobilde doğal | Yerel değil; Obsidian bağlamı, Markdown, kişisel not ve güçlü organizasyon yok. |
| Obsidian Web Clipper | Genel web yakalama, güvenilir ekosistem | Threads zinciri, mobil share ve Threads'e özel veri modeli sınırlı olabilir. |
| Threads Clipper for Obsidian | Like/bookmark ile otomatik kayıt, yorumlar, AI | Chrome/masaüstü odaklı; Local REST API gerekebilir; mağazada 12 kullanıcı görünüyordu. |
| Social Archiver | 21 platform, mobil/web/Chrome, 28 bin indirme, sync | Hesap ve sunucu altyapısı; daha geniş/karmaşık; ücretsiz kota/premium modeli. |
| Picki ve genel bookmark uygulamaları | Çok platform, mobil Share Sheet, kategori | Obsidian-native ve tamamen Markdown/local-first değil. |

Kaynaklar:

- [Threads Clipper for Obsidian — Chrome Web Store](https://chromewebstore.google.com/detail/threads-clipper-for-obsid/jhcffdbojaagahlehckadedkmeomdhim)
- [Social Archiver — Obsidian Community](https://community.obsidian.md/plugins/social-archiver)
- [Picki — App Store](https://apps.apple.com/au/app/picki-bookmark-social-posts/id6758291416)

### Önerilen konumlandırma

> **Threads'te bulduğun fikirleri, başka bir hesap veya bulut servisi olmadan, mobil paylaşım menüsünden kendi Obsidian kasana kaynaklarıyla birlikte kaydet.**

Savunulabilir farklılaşma:

- Tek amaçlı ve hızlı
- Obsidian-native
- Local-first
- Hesapsız
- Mobil-first
- Thread zinciri ve medya farkındalığı

“Her sosyal platformu arşivler” yarışına girmek Social Archiver ile doğrudan rekabet yaratır. İlk aşamada Threads için en iyi, en güvenli, en hızlı yakalama akışı olmak daha mantıklı.

## 9. Brainstorming — neler eklenebilir?

### Önce güven ve veri bütünlüğü

1. **Güvenli capture inbox:** Güncel manuel toplu işleme yaklaşımını koruyun; hiçbir kullanıcı notunu otomatik silmeyin.
2. **Privacy modes:** Link only, excerpt, full text, full text + local media.
3. **Secret storage:** Çerez/OAuth token güvenli kasada.
4. **Provenance:** Post ID, canonical URL, yazar ID, yakalama zamanı, yayın zamanı, içerik hash'i.
5. **Safe update:** Orijinal snapshot korunup değişiklikler diff olarak eklenebilsin.
6. **Deleted/private state:** Kaynak sonradan kaybolduğunda yerel kopya silinmeden durum işareti.

### Ürünü “bookmark mezarlığı” olmaktan çıkaracak özellikler

1. **“Neden kaydettin?” hızlı notu:** Share anında tek satırlık amaç/yorum.
2. **Inbox → processed akışı:** Kaydedilenler önce inbox'a düşsün; kullanıcı etiketleyince arşive taşınsın.
3. **Haftalık resurfacing:** Bu hafta kaydettiğin ama not eklemediğin beş post.
4. **Benzer not bağlantıları:** Obsidian aramasıyla ilgili mevcut notları öner.
5. **Obsidian Bases dashboard:** Yazar, konu, durum, tarih, “kullanıldı mı?” alanları.
6. **Action extraction:** Posttan çıkarılan fikirleri checkbox olarak kullanıcı onayıyla ekle.

### İçerik üreticileri için

1. Swipe-file şablonları: hook, format, CTA, konu, neden çalıştı.
2. “Bu fikri kullandım” durumu ve üretilecek içerik linki.
3. Birden çok posttan moodboard/brief oluşturma.
4. Threads postunu yeniden yazmak yerine kaynak gösteren “inspired by” çalışma akışı.
5. Typefully veya yayın takvimine yalnızca kullanıcının kendi notunu gönderen entegrasyon.

### Araştırmacılar için

1. WARC/PDF değil, hafif “evidence bundle”: Markdown + medya + hash + timestamp.
2. Alıntı modu ve otomatik kaynakça alanı.
3. Yazar/konu bazlı koleksiyon.
4. Manuel doğrulama durumu: doğrulanmadı / doğrulandı / yanlışlandı.
5. Kaynak linki ve yakalama zamanını içeren export.

### İleri seviye, ancak sonra

1. Resmî API ile OAuth.
2. Kullanıcının kendi Threads gönderilerini güvenli içe aktarma.
3. Tamamen yerel opsiyonel AI özetleme/etiketleme.
4. Çok dilli UI: Türkçe + İngilizce ilk sürüm için iyi ayrışma olabilir.
5. Android için belge edilmiş MacroDroid/Tasker veya intent alternatifi; platform kısıtları açıkça belirtilmeli.

## 10. Önerilen 30 günlük yol haritası

### Hafta 1 — Yayını engelleyenler

- CRITICAL-01 URL/cookie açığını kapat.
- Secret storage veya çerez özelliğini geçici olarak kapat.
- HTML/Markdown/YAML escaping.
- Mevcut dosya üzerine yazma koruması.
- Kötü amaçlı ve veri kaybı testleri.

### Hafta 2 — Sağlamlık ve performans

- Medya host/MIME/boyut/adet limitleri.
- Thread author doğrulaması.
- `unrollThreadChain` davranışını uçtan uca düzelt.
- Parser fixture testleri.

### Hafta 3 — Yayın ve hukuk

- Bağımlılıkları pinle/güncelle, lockfile düzelt.
- CI: `npm ci`, typecheck, lint, tests, production build.
- README privacy/network/cookie açıklamasını düzelt.
- Meta kullanım şartları hakkında hukuk görüşü; authenticated scraping için go/no-go.
- `versions.json`, release checklist, `SECURITY.md`.

### Hafta 4 — Beta ve konumlandırma

- 10–20 hedef kullanıcıyla kapalı beta.
- Ölçülecek metrikler: capture success, capture süresi, haftalık save sayısı, yeniden açılan not oranı, hata tipi.
- “Neden kaydettin?” ve inbox akışını test et.
- Güvenlik düzeltmeleri yayınlandıktan sonra sosyal duyuru.

## 11. Yayın öncesi kabul kriterleri

- [x] Deep link girdi testlerinde çerez hiçbir allowlist dışı host'a gidemez.
- [x] Eklenti hiçbir kullanıcı dosyasını otomatik ve kalıcı silemez.
- [x] Var olan kullanıcı notunun üzerine kimlik doğrulamadan yazılamaz.
- [x] Çerez düz metin `data.json` içinde bulunmaz.
- [x] HTML/Markdown/YAML injection testleri geçer.
- [x] Medya için host, MIME, boyut ve adet limitleri vardır.
- [ ] Büyük inbox notlarında toplu işlemin süre ve bellek bütçesi doğrulanmıştır.
- [x] `npm ci`, typecheck, lint, unit test ve build CI iş akışında tanımlıdır; yerel `npm run check` geçer.
- [x] README ağ, pano, gizli bilgi ve veri saklama davranışını doğru açıklar.
- [ ] Meta ToS için açık bir go/no-go kararı belgelenmiştir.
- [ ] iOS ve Android gerçek cihaz testi tamamlanmıştır.

## 12. Threads için hazır postlar

Bu metinler **kritik güvenlik düzeltmeleri tamamlandıktan sonra** kullanılmalıdır.

### Threads postu 1 — problem odaklı lansman

Threads'te çok iyi bir fikir görüp “Kaydet”e basıyorsun.
Bir hafta sonra ne nerede, hatırlamıyorsun.

Threads Saver for Obsidian ile bir postu:

— kendi kasana Markdown olarak kaydet
— thread zincirini tek notta oku
— görselleri yerel olarak arşivle
— etiketle, ara ve kendi notlarınla bağla

Hesap yok. Telemetri yok. Arşiv senin.

Şu an kapalı beta için Obsidian + Threads'i aktif kullanan içerik üreticileri arıyorum. Denemek ister misin?

### Threads postu 2 — geri bildirim / build in public

Bir “saved posts” aracı yaparken şunu fark ettim:

Asıl problem kaydetmek değil, tekrar bulmak.

Bu yüzden Threads → Obsidian akışına üç şey ekliyorum:

1. Kaydederken “Bunu neden sakladım?” notu
2. Otomatik konu/yazar düzeni
3. Haftalık yeniden karşılaştırma: kaydettin ama kullanmadın

Sen Threads'te kaydettiğin içerikleri ne için kullanıyorsun?

— içerik fikri
— araştırma
— ilham arşivi
— sonra okumak
— başka?

## 13. Instagram için hazır postlar

### Instagram carousel 1 — ürün tanıtımı

**Slide 1**
Threads'te kaydettiğin o harika post…
Şimdi nerede?

**Slide 2**
Saved listeleri hızlı büyüyor.
Arama, bağlam ve kendi notların eksik kalıyor.

**Slide 3**
Threads Saver for Obsidian
Postu kendi Markdown kasana taşır.

**Slide 4**
✓ Thread zinciri
✓ Kaynak linki
✓ Yerel görseller
✓ Etiket ve full-text arama

**Slide 5**
Başka hesap yok.
Başka bir içerik bulutu yok.
Arşiv senin kasanda.

**Slide 6**
Kapalı betaya katılmak için “OBSIDIAN” yaz veya bio'daki bağlantıya git.

**Caption**

Kaydetmek kolay. Tekrar bulmak zor.

Threads'te gördüğün fikirleri, araştırmaları ve içerik örneklerini kendi Obsidian sistemine taşımak için Threads Saver'ı geliştiriyorum.

Amaç yeni bir bookmark mezarlığı kurmak değil; kaydettiğin şeyi tekrar kullanabildiğin bir akış oluşturmak.

Kapalı beta için özellikle içerik üreticileri, araştırmacılar ve yoğun Obsidian kullanıcıları arıyorum. Katılmak istersen yorumlara **OBSIDIAN** yaz.

#obsidian #pkm #secondbrain #threads #contentcreator #notetaking #productivity

### Instagram carousel 2 — eğitim/problem farkındalığı

**Slide 1**
“Kaydettim” neden “hatırlayacağım” demek değil?

**Slide 2**
Çünkü kayıt, bağlam olmadan yalnızca bir linktir.

**Slide 3**
Kaydederken şu üç soruyu cevapla:
Neden önemli?
Nerede kullanacağım?
Hangi notumla bağlantılı?

**Slide 4**
İyi bir arşiv şunları korur:
Kaynak + yazar + tarih + senin yorumun

**Slide 5**
Threads Saver'ın bir sonraki özelliği:
“Bunu neden kaydettin?” hızlı notu.

**Slide 6**
Senin saved listen bilgi arşivi mi, dijital mezarlık mı?

**Caption**

Bookmark araçlarının çoğu “yakalama”yı çözüyor. Asıl değer, aylar sonra doğru fikri yeniden bulup kullanabilmekte.

Bu yüzden Threads Saver'da hız kadar bağlamı da önemsiyorum: kaynak, yazar, etiket ve kullanıcının kendi kısa notu aynı yerde.

Sen kaydettiğin postlara geri dönüyor musun? Yorumlarda sistemini anlat.

#knowledgeManagement #obsidianmd #digitalknowledge #threadsapp #creatoreconomy

## 14. Son karar

**Go:** Fikir, hedef kullanıcı ve local-first konumlandırma güçlü. Güvenli bir beta için yatırım yapmaya değer.

**`1.0.3` için no-go:** İncelenen eski sürümle genel duyuru, Community Plugin başvurusu veya gerçek kullanıcı kasalarında kullanım uygun değildi.

**`1.1.0` için koşullu beta:** Teknik yayın engelleri kod ve otomatik test düzeyinde kapatıldı. Gerçek Meta fixture'ları, iki mobil platform ve büyük inbox testi geçtikten; authenticated extraction için hukuk/ürün kararı verildikten sonra sınırlı beta yapılabilir.
