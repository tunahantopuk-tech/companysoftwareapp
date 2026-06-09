# Admin Panel Kullanım Kılavuzu

## 🔐 Giriş Bilgileri

**URL:** `http://localhost:4321/admin`

**Kullanıcı Adı:** `admin`  
**Şifre:** `admin123`

> ⚠️ **Önemli:** Production'a geçmeden önce şifreyi değiştirmeyi unutmayın!

---

## 📁 Klasör Yapısı

```
data/admin/projects/
├── futboxo.json          # Proje metadata
├── vibeco.json
├── gezdoku.json
├── futboxo/
│   ├── notes/           # Markdown notlar
│   └── prompts/         # Prompt markdown dosyaları
├── vibeco/
│   ├── notes/
│   └── prompts/
└── gezdoku/
    ├── notes/
    └── prompts/
```

---

## ✨ Özellikler

### 1. 🏠 Dashboard
- Tüm projelerin özeti
- İstatistikler (Toplam, Geliştiriliyor, Yakında)
- Proje kartları (logo, durum, platform, son güncelleme)
- Projelere hızlı erişim

### 2. 📋 Proje Detay Sayfası

Her proje için:

#### **Genel Bilgiler**
- Platform
- Durum
- Oluşturulma tarihi
- Son güncelleme
- Açıklama

#### **🤖 AI Context Builder** (⭐ En Güçlü Özellik)
Tek tıkla şunları otomatik oluşturur:
- Proje özeti
- Mevcut durum
- Son aktiviteler (günlük kayıtları)
- Açık görevler
- Kayıtlı promptlar

**Kullanımı:**
1. "Context Oluştur ve Kopyala" butonuna tıkla
2. Otomatik olarak panoya kopyalanır
3. Claude Code'a direkt yapıştır!

**Örnek Çıktı:**
```
Project: Futboxo

Description:
Futboxo ile futbol bilginizi test edin...

Current Status: Geliştiriliyor
Platform: iOS, Android

Recent Activity:
- 07 Haziran 2026: Oyuncu kartı tasarımı tamamlandı...
- 06 Haziran 2026: XOX oyun modunun temel mekaniği kodlandı...

Open Tasks (4):
1. StoreKit abonelik sistemi
2. Oyuncu kartı animasyonu
3. KVKK ekranı
4. Push notification entegrasyonu

Saved Prompts (2):
- Oyuncu Kartı Tasarımı V4
- App Store Açıklaması
```

#### **📝 Proje Günlüğü**
- Tarihli günlük kayıtlar
- "Bugün ne yaptın?" formatında
- Kronolojik sıralama

#### **💬 AI Prompt Merkezi**
- Sık kullanılan promptları kaydet
- Tek tıkla kopyala
- Başlık + içerik formatında

#### **✅ Görevler**
- Yapılacaklar listesi
- Checkbox ile tamamlama
- Tamamlananlar işaretli

#### **📄 Markdown Vault**
- Markdown formatında notlar
- Export özelliği
- Versiyon kontrolü için ideal

---

## 🔧 Veri Güncelleme

### JSON Dosyası Düzenleme

Örnek: `data/admin/projects/futboxo.json`

```json
{
  "id": "futboxo",
  "name": "Futboxo",
  "logo": "/images/Futboxo.png",
  "description": "...",
  "platform": "iOS, Android",
  "status": "Geliştiriliyor",
  "createdAt": "2026-06-09",
  "updatedAt": "2026-06-09",
  "dailyLogs": [
    {
      "date": "07 Haziran 2026",
      "content": "Bugün yapılanlar..."
    }
  ],
  "prompts": [
    {
      "id": "1",
      "title": "Prompt Başlığı",
      "content": "Prompt içeriği..."
    }
  ],
  "tasks": [
    {
      "id": "1",
      "text": "Görev açıklaması",
      "completed": false
    }
  ]
}
```

### Yeni Günlük Kaydı Ekleme

```json
{
  "date": "09 Haziran 2026",
  "content": "Avatar sistemi tamamlandı. Kulüp logoları entegre edildi."
}
```

### Yeni Prompt Ekleme

```json
{
  "id": "3",
  "title": "Logo Tasarımı",
  "content": "Modern bir futbol logosu tasarla. Renkler: Mavi-Beyaz..."
}
```

### Yeni Görev Ekleme

```json
{
  "id": "6",
  "text": "Pazar yeri ekranı",
  "completed": false
}
```

---

## 🚀 Kullanım Senaryoları

### Senaryo 1: Günlük İş Akışı
1. Sabah admin panele gir
2. İlgili projeyi aç
3. Günlüğe dünkü çalışmaları ekle
4. Görevleri güncelle
5. AI Context Builder ile context oluştur
6. Claude Code'a yapıştır ve günün işine başla

### Senaryo 2: Yeni Özellik Geliştirme
1. İlgili prompt'u bul ve kopyala
2. Claude'a yapıştır
3. Kod ürettir
4. Tamamlanan görevi işaretle
5. Günlüğe not ekle

### Senaryo 3: Proje Durumu Paylaşımı
1. AI Context Builder kullan
2. Oluşan context'i kopyala
3. Email/Slack'te paylaş veya Claude'a ver

---

## 💡 İpuçları

1. **Düzenli Günlük Tutun:** Her gün sonunda 2-3 cümlelik özet ekleyin
2. **Promptları Kategorize Edin:** Tasarım, Backend, Frontend gibi
3. **Kısa ve Öz Görevler:** "Login ekranı yap" yerine "Login ekranı UI tasarımı"
4. **Context Builder'ı Kullanın:** Her Claude oturumunda fresh context için
5. **Markdown Notları:** Karmaşık kararlar için ayrıntılı notlar alın

---

## 🔜 Gelecek Özellikler

- [ ] API endpoints ile dinamik veri güncelleme
- [ ] Yeni proje oluşturma arayüzü
- [ ] Markdown editor entegrasyonu
- [ ] Export/Import özelliği
- [ ] Arama ve filtreleme
- [ ] Proje arası prompt paylaşımı
- [ ] Gelişmiş istatistikler ve grafikler

---

## 🛡️ Güvenlik Notları

- Şu anda basit sessionStorage authentication kullanılıyor
- Production için:
  - Environment variable'da şifre tut
  - JWT veya session-based auth ekle
  - HTTPS kullan
  - Rate limiting ekle

---

## 📞 Destek

Sorun yaşarsanız:
1. Browser console'u kontrol edin
2. JSON dosyalarının syntax'ını doğrulayın
3. Klasör yapısının doğru olduğundan emin olun

---

**Not:** Bu sistem tamamen local çalışır ve hiçbir external API kullanmaz. Tüm veriler `data/admin/` klasöründe saklanır.
