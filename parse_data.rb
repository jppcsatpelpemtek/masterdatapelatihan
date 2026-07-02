require 'json'

def parse_csv_robust(csv_text)
  rows = []
  current_row = []
  current_field = ""
  in_quotes = false
  i = 0
  len = csv_text.length
  
  while i < len
    char = csv_text[i]
    if char == '"'
      if in_quotes && csv_text[i+1] == '"'
        current_field << '"'
        i += 1
      else
        in_quotes = !in_quotes
      end
    elsif char == ',' && !in_quotes
      current_row << current_field
      current_field = ""
    elsif (char == "\n" || char == "\r") && !in_quotes
      if char == "\r" && csv_text[i+1] == "\n"
        i += 1
      end
      current_row << current_field
      rows << current_row
      current_row = []
      current_field = ""
    else
      current_field << char
    end
    i += 1
  end
  
  if current_field != "" || (csv_text[-1] == ',' rescue false)
    current_row << current_field
  end
  rows << current_row unless current_row.empty?
  rows
end

def parse_csv
  csv_path = "/Users/syahril/.gemini/antigravity-ide/brain/10739bc5-7e20-474f-af1b-af3e7ee0a0c7/.system_generated/steps/7/content.md"
  
  lines = File.readlines(csv_path)
  
  csv_start_index = 0
  lines.each_with_index do |line, idx|
    if line.strip == '---'
      csv_start_index = idx + 1
      break
    end
  end
  
  csv_content = lines[csv_start_index..-1].join
  
  # Parse using robust character parser
  csv_rows = parse_csv_robust(csv_content)
  
  # Filter out empty or header lines
  # The first row is the header
  # Skip spacer (usually row 1) and From/To header (usually row 2)
  rows = csv_rows[3..-1]
  
  data = []
  current_kegiatan = nil
  current_no = nil
  
  doc_keys = [
    "kurikulum", "kak", "undangan_rapat_persiapan", "notulen_rapat_persiapan",
    "permohonan_narsum", "surat_permohonan_peserta", "panggilan_peserta",
    "sk_penunjukan", "st_penyelenggara", "st_wi", "undangan_rapat_evaluasi",
    "notulen_rapat_evaluasi", "sk_penetapan", "surat_pengembalian_peserta",
    "rekap_nilai", "absensi", "biodata_pengajar", "ktp_npwp", "materi",
    "jadwal", "laporan_akhir", "dokumentasi", "hasil_evaluasi"
  ]
  
  rows.each do |row|
    next if row.nil? || row.length < 3
    
    no_val = row[0] ? row[0].strip : ""
    kegiatan_val = row[1] ? row[1].strip : ""
    akt_val = row[2] ? row[2].strip : ""
    
    next if no_val == "" && kegiatan_val == "" && akt_val == ""
    
    if no_val == "" && kegiatan_val == ""
      next if current_kegiatan.nil?
    else
      current_no = no_val
      current_kegiatan = kegiatan_val
    end
    
    from_date = row[3] ? row[3].strip : ""
    to_date = row[4] ? row[4].strip : ""
    
    waktu = from_date
    if to_date != ""
      waktu = "#{from_date} s.d. #{to_date}"
    end
    
    # Parse teachers (col 13)
    pengajar_val = row[13] ? row[13].strip : ""
    pengajar = pengajar_val.split("\n").map(&:strip).reject(&:empty?)
    
    # Parse documents (col 15 to 37)
    docs = {}
    doc_keys.each_with_index do |key, idx|
      col_idx = 15 + idx
      val = row[col_idx] ? row[col_idx].strip : ""
      if ["none", "-", "", "null"].include?(val.downcase)
        docs[key] = nil
      else
        files = val.split("\n").map(&:strip).reject(&:empty?)
        docs[key] = files.length > 1 ? files : files[0]
      end
    end
    
    batch = {
      "akt" => akt_val,
      "waktu_pelaksanaan" => waktu,
      "from_date" => from_date,
      "to_date" => to_date,
      "triwulan" => row[5] ? row[5].strip : "",
      "jumlah_hari" => row[7] ? row[7].strip : "",
      "jumlah_jp" => row[8] ? row[8].strip : "",
      "jp_berbayar" => row[9] ? row[9].strip : "",
      "total_peserta" => row[10] ? row[10].strip : "",
      "lulus" => row[11] ? row[11].strip : "",
      "tidak_lulus" => row[12] ? row[12].strip : "",
      "pengajar" => pengajar,
      "tempat" => row[14] ? row[14].strip : "",
      "documents" => docs
    }
    
    existing_kegiatan = data.find { |item| item["kegiatan"] == current_kegiatan }
    if existing_kegiatan
      existing_kegiatan["angkatan"] << batch
    else
      data << {
        "no" => current_no,
        "kegiatan" => current_kegiatan,
        "jumlah_akt" => row[6] ? row[6].strip : "1",
        "angkatan" => [batch]
      }
    end
  end
  
  output_js_path = "/Users/syahril/Documents/Master Data Pelatihan Pengembangan Kompetensi Pemerintahan dan Teknis/data.js"
  File.open(output_js_path, "w") do |f|
    f.write("// Automatically generated database from Google Spreadsheet\n")
    f.write("const INITIAL_DATA = ")
    f.write(JSON.pretty_generate(data))
    f.write(";\n")
  end
  
  puts "Successfully parsed #{data.length} training activities and written to data.js"
end

if __FILE__ == $0
  parse_csv
end
