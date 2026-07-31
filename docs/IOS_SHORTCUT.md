# iOS/iPadOS Kestirme rehberi

Threads & Instagram Saver, iOS Kestirmeler üzerinden paylaşılmış desteklenen bir Threads veya Instagram bağlantısını kabul edebilir.

## Kurulum

1. Kestirmeler uygulamasında yeni bir kestirme oluşturun.
2. Adını **Obsidian'a sosyal post kaydet** yapın.
3. **Paylaşım Sayfasında Göster** seçeneğini açın; giriş türlerini URL ve metinle sınırlandırın.
4. **URL Kodla** eylemini ekleyin ve girdi olarak **Kestirme Girdisi**ni seçin.
5. **URL Aç** eylemini ekleyin.
6. URL alanına şunu yazın:

```text
obsidian://social-saver?url=URL_Encoded_Text
```

`URL_Encoded_Text` alanına önceki eylemin sihirli değişkenini yerleştirin.

## Kullanım

1. Threads veya Instagram uygulamasında desteklenen bir gönderiyi açın.
2. Paylaş menüsünden kestirmeyi seçin.
3. Obsidian açılır; eklenti URL'yi güvenli alan adı doğrulamasından sonra işler ve platform için seçilmiş hedefe kaydeder.

> [!NOTE]
> Android'de bir topluluk eklentisi Obsidian'ın yerel paylaşım ekranını atlayamaz. Android için bağlantıyı kopyalayıp Obsidian'daki pano komutunu veya isteğe bağlı pano algılamayı kullanın.

> [!IMPORTANT]
> Kestirme girişinin tamamını URL kodlama adımından geçirin. Eklenti yalnız HTTPS kullanan tam eşleşmeli Threads/Instagram hostlarını kabul eder; yine de doğru kodlama kestirme parametrelerinin bozulmasını önler.
