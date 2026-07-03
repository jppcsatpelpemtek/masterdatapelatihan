/**
 * Google Apps Script - Master Data Pelatihan API Wrapper
 * 
 * Tempatkan kode ini di Google Sheets Anda:
 * Extensions -> Apps Script -> Ganti semua kode dengan kode ini.
 * Simpan dan klik 'Deploy' -> 'New deployment' -> 'Web app'.
 * Atur:
 * - Execute as: Me
 * - Who has access: Anyone
 */

function doGet(e) {
  // Fitur Pencarian File Google Drive dinamis saat diklik download/view
  var action = e && e.parameter && e.parameter.action;
  if (action === "getFile") {
    var filename = e.parameter.filename;
    var result = { url: null, found: false };
    if (filename) {
      try {
        // Cari file dengan nama persis atau mengandung nama tersebut (agar tidak sensitif terhadap ekstensi seperti .pdf)
        // Gunakan escape untuk mencegah error karakter khusus
        var safeFilename = filename.replace(/'/g, "\\'");
        var files = DriveApp.searchFiles("title contains '" + safeFilename + "' and trashed = false");
        
        if (files.hasNext()) {
          var file = files.next();
          result.url = file.getUrl();
          result.id = file.getId();
          result.found = true;
        } else {
          // Coba cari sebagai folder jika file tidak ditemukan
          var folders = DriveApp.searchFolders("title contains '" + safeFilename + "' and trashed = false");
          if (folders.hasNext()) {
            var folder = folders.next();
            result.url = folder.getUrl();
            result.id = folder.getId();
            result.found = true;
          }
        }
      } catch (err) {
        result.error = err.toString();
      }
    }
    var callback = e && e.parameter && e.parameter.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }


  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var sheet = sheets[0]; // Menggunakan sheet pertama
  var rows = sheet.getDataRange().getDisplayValues();
  
  // Ambil semua RichTextValue dalam satu panggilan (untuk membaca hyperlink di sel)
  var richTextValues = sheet.getDataRange().getRichTextValues();
  var formulas = sheet.getDataRange().getFormulas();
  
  // Mencari letak baris header data
  var startIndex = 0;
  for (var i = 0; i < rows.length; i++) {
    var col0 = rows[i][0] ? rows[i][0].toString().trim() : "";
    var col1 = rows[i][1] ? rows[i][1].toString().trim() : "";
    if (col0 === "No" || col0 === "No." || col1 === "Kegiatan" || col1 === "Kegiatan Pelatihan") {
      startIndex = i + 1; // Mulai dari baris setelah header
      break;
    }
  }
  if (startIndex === 0) startIndex = 1; // Fallback jika tidak terdeteksi
  
  var data = [];
  var currentKegiatan = null;
  var currentNo = null;
  
  var docKeys = [
    "kurikulum", "kak", "undangan_rapat_persiapan", "notulen_rapat_persiapan",
    "permohonan_narsum", "surat_permohonan_peserta", "panggilan_peserta",
    "sk_penunjukan", "st_penyelenggara", "st_wi", "undangan_rapat_evaluasi",
    "notulen_rapat_evaluasi", "berita_acara_evaluasi", "sk_penetapan", "surat_pengembalian_peserta",
    "rekap_nilai", "absensi", "biodata_pengajar", "daftar_hadir_narsum", "daftar_hadir_penyelenggara",
    "ktp_npwp", "materi", "jadwal", "laporan_akhir", "dokumentasi", "hasil_evaluasi"
  ];

  
  for (var i = startIndex; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 4) continue;
    
    var noVal = row[0] ? row[0].toString().trim() : "";
    var kegiatanVal = row[1] ? row[1].toString().trim() : "";
    var rumpunVal = row[2] ? row[2].toString().trim() : "";
    var aktVal = row[3] ? row[3].toString().trim() : "";
    
    // Jika baris kosong, lewati
    if (noVal === "" && kegiatanVal === "" && aktVal === "") continue;
    
    // Menurunkan data Kegiatan jika kosong (untuk baris Angkatan berikutnya)
    var currentRumpun = "";
    if (noVal === "" && kegiatanVal === "") {
      if (!currentKegiatan) continue;
    } else {
      currentNo = noVal;
      currentKegiatan = kegiatanVal;
      currentRumpun = rumpunVal;
    }
    
    var fromDate = row[4] ? row[4].toString().trim() : "";
    var toDate = row[5] ? row[5].toString().trim() : "";
    var waktu = fromDate;
    if (toDate !== "") {
      waktu = fromDate + " s.d. " + toDate;
    }
    
    // Parse Pengajar (baris baru dipisah) - kolom 15
    var pengajarVal = row[15] ? row[15].toString().trim() : "";
    var pengajar = [];
    if (pengajarVal !== "") {
      pengajar = pengajarVal.split('\n').map(function(t) { return t.trim(); }).filter(Boolean);
    }
    
    // Parse Dokumen (index 16 s.d 41) - geser +2 dari index 14
    var docs = {};
    for (var d = 0; d < docKeys.length; d++) {
      var colIdx = 16 + d;
      var val = row[colIdx] ? row[colIdx].toString().trim() : "";
      if (["none", "-", "", "null"].indexOf(val.toLowerCase()) !== -1) {
        docs[docKeys[d]] = null;
      } else {
        var cellLink = null;
        if (richTextValues && richTextValues[i] && richTextValues[i][colIdx]) {
          cellLink = richTextValues[i][colIdx].getLinkUrl();
        }
        
        // Fallback: Ekstrak link dari formula =HYPERLINK("url", "nama")
        if (!cellLink && formulas && formulas[i] && formulas[i][colIdx]) {
          var formula = formulas[i][colIdx];
          var match = formula.match(/=(?:HYPERLINK|hyperlink)\(\s*["']([^"']+)["']/i);
          if (match && match[1]) {
            cellLink = match[1];
          }
        }
        
        var files = val.split('\n').map(function(f) { return f.trim(); }).filter(Boolean);
        
        if (cellLink) {
          docs[docKeys[d]] = { name: files[0] || val, url: cellLink };
        } else if (val.toLowerCase().indexOf('http') === 0) {
          // Jika admin mengisi raw URL secara langsung dari portal
          docs[docKeys[d]] = { name: "Buka Dokumen", url: val };
        } else {
          docs[docKeys[d]] = files.length > 1 ? files : files[0];
        }
      }
    }
    
    var batch = {
      "akt": aktVal,
      "waktu_pelaksanaan": waktu,
      "from_date": fromDate,
      "to_date": toDate,
      "triwulan": row[6] ? row[6].toString().trim() : "",
      "tahun": row[7] ? row[7].toString().trim() : "",
      "jumlah_hari": row[9] ? row[9].toString().trim() : "",
      "jumlah_jp": row[10] ? row[10].toString().trim() : "",
      "jp_berbayar": row[11] ? row[11].toString().trim() : "",
      "total_peserta": row[12] ? row[12].toString().trim() : "",
      "lulus": row[13] ? row[13].toString().trim() : "",
      "tidak_lulus": row[14] ? row[14].toString().trim() : "",
      "pengajar": pengajar,
      "tempat": row[8] ? row[8].toString().trim() : "",
      "documents": docs
    };
    
    // Cari apakah Kegiatan sudah ada di array hasil
    var existing = null;
    for (var k = 0; k < data.length; k++) {
      if (data[k].kegiatan === currentKegiatan) {
        existing = data[k];
        break;
      }
    }
    
    if (existing) {
      existing.angkatan.push(batch);
    } else {
      data.push({
        "no": currentNo,
        "kegiatan": currentKegiatan,
        "rumpun_kompetensi": currentRumpun,
        "jumlah_akt": "1",
        "angkatan": [batch]
      });
    }
  }
  
  // Mendukung JSONP callback untuk bypass CORS dari browser
  var callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(data) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    var sheet = sheets[0];
    var rows = sheet.getDataRange().getValues();
    
    // Mencari baris awal data
    var startIndex = 0;
    for (var i = 0; i < rows.length; i++) {
      var col0 = rows[i][0] ? rows[i][0].toString().trim() : "";
      var col1 = rows[i][1] ? rows[i][1].toString().trim() : "";
      if (col0 === "No" || col0 === "No." || col1 === "Kegiatan") {
        startIndex = i + 1; // Mulai dari baris setelah header
        break;
      }
    }
    if (startIndex === 0) startIndex = 1;
    
    // Hapus baris data lama (sisakan header & subheader)
    var lastRow = sheet.getLastRow();
    if (lastRow >= startIndex) {
      sheet.deleteRows(startIndex, lastRow - startIndex + 1);
    }
    
    // Konversi objek database UI ke dalam baris-baris spreadsheet
    var rowsToWrite = [];
    var docKeys = [
      "kurikulum", "kak", "undangan_rapat_persiapan", "notulen_rapat_persiapan",
      "permohonan_narsum", "surat_permohonan_peserta", "panggilan_peserta",
      "sk_penunjukan", "st_penyelenggara", "st_wi", "undangan_rapat_evaluasi",
      "notulen_rapat_evaluasi", "berita_acara_evaluasi", "sk_penetapan", "surat_pengembalian_peserta",
      "rekap_nilai", "absensi", "biodata_pengajar", "daftar_hadir_narsum", "daftar_hadir_penyelenggara",
      "ktp_npwp", "materi", "jadwal", "laporan_akhir", "dokumentasi", "hasil_evaluasi"
    ];
    
    postData.forEach(function(keg) {
      keg.angkatan.forEach(function(ang, idx) {
        var row = [];
        row.push(idx === 0 ? keg.no : "");
        row.push(idx === 0 ? keg.kegiatan : "");
        row.push(idx === 0 ? (keg.rumpun_kompetensi || "") : "");
        row.push(ang.akt || "");
        row.push(ang.from_date || "");
        row.push(ang.to_date || "");
        row.push(ang.triwulan || "");
        row.push(ang.tahun || "");
        row.push(ang.tempat || "");
        row.push(ang.jumlah_hari || "");
        row.push(ang.jumlah_jp || "");
        row.push(ang.jp_berbayar || "");
        row.push(ang.total_peserta || "");
        row.push(ang.lulus || "");
        row.push(ang.tidak_lulus || "");
        
        var teachers = Array.isArray(ang.pengajar) ? ang.pengajar.join('\n') : (ang.pengajar || "");
        row.push(teachers);
        
        // Menulis dokumen (index 16 s.d 41)
        docKeys.forEach(function(key) {
          var val = ang.documents ? ang.documents[key] : null;
          if (!val) {
            row.push("");
          } else if (Array.isArray(val)) {
            row.push(val.join('\n'));
          } else {
            row.push(val);
          }
        });
        
        rowsToWrite.push(row);
      });
    });
    
    if (rowsToWrite.length > 0) {
      var range = sheet.getRange(startIndex, 1, rowsToWrite.length, rowsToWrite[0].length);
      range.setValues(rowsToWrite);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Pemicu Otomatis (Trigger): Dipanggil setiap ada perubahan di spreadsheet.
 * Mengirimkan data terbaru langsung ke Firebase Firestore secara realtime.
 * 
 * CARA MENGAKTIFKAN:
 * 1. Di Google Apps Script editor, klik ikon jam weker (Triggers) di menu kiri.
 * 2. Klik '+ Add Trigger' di kanan bawah.
 * 3. Konfigurasi:
 *    - Choose which function to run: 'onEditTrigger'
 *    - Choose which deployment should run: 'Head'
 *    - Select event source: 'From spreadsheet'
 *    - Select event type: 'On edit' (atau 'On change')
 * 4. Klik Save dan setujui izin akses akun Google Anda.
 */
function onEditTrigger(e) {
  try {
    // Ambil data terbaru
    var data = doGet(null);
    var dataJson = JSON.parse(data.getContent());
    
    // Kirim langsung ke Firebase Firestore REST API
    var projectId = "pemerintahanteknis";
    var firestoreUrl = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/master_data/pelatihan_db";
    
    var docLabels = {
      "kurikulum": "Kurikulum", "kak": "KAK", "undangan_rapat_persiapan": "Undangan Rapat Persiapan",
      "notulen_rapat_persiapan": "Notulen Rapat Persiapan", "permohonan_narsum": "Permohonan Narsum",
      "surat_permohonan_peserta": "Surat Permohonan Peserta", "panggilan_peserta": "Panggilan Peserta",
      "sk_penunjukan": "SK Penunjukan", "st_penyelenggara": "ST Penyelenggara", "st_wi": "ST WI",
      "undangan_rapat_evaluasi": "Undangan Rapat Evaluasi", "notulen_rapat_evaluasi": "Notulen Rapat Evaluasi",
      "berita_acara_evaluasi": "Berita Acara Evaluasi", "sk_penetapan": "SK Penetapan",
      "surat_pengembalian_peserta": "Surat Pengembalian Peserta", "rekap_nilai": "Rekap Nilai Peserta",
      "absensi": "Absensi Peserta", "biodata_pengajar": "Biodata Pengajar", "daftar_hadir_narsum": "Daftar Hadir Narasumber",
      "daftar_hadir_penyelenggara": "Daftar Hadir Penyelenggara", "ktp_npwp": "KTP, NPWP Pengajar",
      "materi": "Materi Pengajar", "jadwal": "Jadwal Harian", "laporan_akhir": "Laporan Akhir",
      "dokumentasi": "Dokumentasi", "hasil_evaluasi": "Hasil Evaluasi"
    };

    // Konversi nilai JavaScript ke Firestore Format Value
    function toFirestoreValue(val) {
      if (val === null || val === undefined) {
        return { nullValue: null };
      } else if (typeof val === 'boolean') {
        return { booleanValue: val };
      } else if (typeof val === 'number') {
        return { doubleValue: val };
      } else if (typeof val === 'string') {
        return { stringValue: val };
      } else if (Array.isArray(val)) {
        var list = [];
        for (var i = 0; i < val.length; i++) {
          list.push(toFirestoreValue(val[i]));
        }
        return { arrayValue: { values: list } };
      } else if (typeof val === 'object') {
        var fields = {};
        for (var key in val) {
          fields[key] = toFirestoreValue(val[key]);
        }
        return { mapValue: { fields: fields } };
      }
      return { nullValue: null };
    }

    var payload = {
      fields: {
        kegiatanList: toFirestoreValue(dataJson),
        documentLabels: toFirestoreValue(docLabels)
      }
    };

    var options = {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    UrlFetchApp.fetch(firestoreUrl, options);
    Logger.log("Realtime sync ke Firebase berhasil.");
  } catch (err) {
    Logger.log("Gagal sync realtime: " + err.toString());
  }
}
