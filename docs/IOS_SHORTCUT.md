# 📱 iOS Kestirmesi (Shortcut) Rehberi

**Threads Saver**, iOS Shortcuts (Kestirmeler) üzerinden paylaşılan Threads bağlantılarını kabul eder. Threads uygulamasında bir gönderinin altındaki **Paylaş** butonuna basıp **Threads Saver** kestirmesini seçtiğinizde Obsidian açılır; eklenti gönderiyi getirip biçimlendirilmiş notu oluşturur.

---

## 🛠 Adım Adım iOS Kestirmesi Oluşturma (2 Dakika)

1. iPhone / iPad cihazınızda **Kestirmeler (Shortcuts)** uygulamasını açın.
2. Sağ üstteki **`+`** simgesine basıp yeni bir kestirme oluşturun.
3. Kestirmenin adını **Threads Saver** veya **Save to Obsidian** yapın.
4. **Paylaşım Sayfasında Göster (Show in Share Sheet)** seçeneğini aktif edin:
   * *Giriş Türleri:* Metin ve URL'ler.
5. Eylem ekleyin: **URL Kodla (Encode URL)**
   * *Girdi:* `Shortcut Input` (Kestirme Girdisi).
6. Eylem ekleyin: **URL Aç (Open URL)**
   * *URL formatı:*
     `obsidian://threads-saver?url=URL_Encoded_Text`
7. Kaydedin!

---

## 📲 Kullanımı

1. **Threads** uygulamasında kaydetmek istediğiniz herhangi bir gönderiyi açın.
2. Gönderinin altındaki **Paylaş (Share)** butonuna basın.
3. Açılan iOS paylaşım sayfasında **Threads Saver** kestirmesini seçin.
4. Obsidian açılacak; Threads Saver bağlantıyı işleyerek notunuzu zengin içerikle kaydedecektir.

> [!NOTE]
> Bu akış iOS/iPadOS Kestirmeler uygulamasına özeldir. Android'de doğrudan Obsidian'a paylaşım, önce Obsidian'ın kendi not seçme/ekleme ekranını açar ve bir topluluk eklentisi bu ekranı atlayamaz.
