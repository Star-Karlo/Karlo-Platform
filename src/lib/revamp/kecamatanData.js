// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
// Kecamatan (sub-district) lists keyed by the exact "KOTA X" / "KABUPATEN X"
// strings used in indonesianCities.js. Coverage is best-effort, not
// exhaustive: all 98 kota are included, plus a substantial set of the
// larger/more commonly used kabupaten. Kota/kabupaten not present here have
// no cascading kecamatan data yet — the UI falls back to a free-text input
// for those (see AgreementFormView.vue), so nothing breaks, it's just less
// convenient until more entries are added.
export const KECAMATAN_BY_REGION = {
  'KOTA BANDA ACEH': ['Baiturrahman', 'Banda Raya', 'Meuraxa', 'Jaya Baru', 'Lueng Bata', 'Kuta Alam', 'Kuta Raja', 'Syiah Kuala', 'Ulee Kareng'],
  'KOTA SABANG': ['Sukakarya', 'Sukajaya'],
  'KOTA LANGSA': ['Langsa Barat', 'Langsa Kota', 'Langsa Lama', 'Langsa Timur', 'Langsa Baro'],
  'KOTA LHOKSEUMAWE': ['Banda Sakti', 'Blang Mangat', 'Muara Dua', 'Muara Satu'],
  'KOTA SUBULUSSALAM': ['Simpang Kiri', 'Longkib', 'Penanggalan', 'Rundeng', 'Sultan Daulat'],

  'KOTA MEDAN': ['Medan Amplas', 'Medan Area', 'Medan Barat', 'Medan Baru', 'Medan Belawan', 'Medan Deli', 'Medan Denai', 'Medan Helvetia', 'Medan Johor', 'Medan Kota', 'Medan Labuhan', 'Medan Maimun', 'Medan Marelan', 'Medan Perjuangan', 'Medan Petisah', 'Medan Polonia', 'Medan Selayang', 'Medan Sunggal', 'Medan Tembung', 'Medan Timur', 'Medan Tuntungan'],
  'KOTA BINJAI': ['Binjai Barat', 'Binjai Kota', 'Binjai Selatan', 'Binjai Timur', 'Binjai Utara'],
  'KOTA TEBING TINGGI': ['Bajenis', 'Padang Hulu', 'Padang Hilir', 'Rambutan', 'Tebing Tinggi Kota'],
  'KOTA PEMATANGSIANTAR': ['Siantar Barat', 'Siantar Marihat', 'Siantar Marimbun', 'Siantar Martoba', 'Siantar Selatan', 'Siantar Sitalasari', 'Siantar Timur', 'Siantar Utara'],
  'KOTA TANJUNGBALAI': ['Datuk Bandar', 'Datuk Bandar Timur', 'Sei Tualang Raso', 'Tanjungbalai Selatan', 'Tanjungbalai Utara', 'Teluk Nibung'],
  'KOTA SIBOLGA': ['Sibolga Kota', 'Sibolga Selatan', 'Sibolga Sambas', 'Sibolga Utara'],
  'KOTA PADANGSIDIMPUAN': ['Padangsidimpuan Angkola Julu', 'Padangsidimpuan Batunadua', 'Padangsidimpuan Hutaimbaru', 'Padangsidimpuan Selatan', 'Padangsidimpuan Tenggara', 'Padangsidimpuan Utara'],
  'KOTA GUNUNGSITOLI': ["Gunungsitoli", "Gunungsitoli Alo'oa", 'Gunungsitoli Barat', 'Gunungsitoli Idanoi', 'Gunungsitoli Selatan', 'Gunungsitoli Utara'],

  'KOTA PADANG': ['Bungus Teluk Kabung', 'Koto Tangah', 'Kuranji', 'Lubuk Begalung', 'Lubuk Kilangan', 'Nanggalo', 'Padang Barat', 'Padang Selatan', 'Padang Timur', 'Padang Utara', 'Pauh'],
  'KOTA BUKITTINGGI': ['Aur Birugo Tigo Baleh', 'Guguk Panjang', 'Mandiangin Koto Selayan'],
  'KOTA PADANG PANJANG': ['Padang Panjang Barat', 'Padang Panjang Timur'],
  'KOTA PAYAKUMBUH': ['Payakumbuh Barat', 'Payakumbuh Timur', 'Payakumbuh Utara', 'Payakumbuh Selatan', 'Lamposi Tigo Nagori'],
  'KOTA SAWAHLUNTO': ['Barangin', 'Lembah Segar', 'Silungkang', 'Talawi'],
  'KOTA SOLOK': ['Lubuk Sikarah', 'Tanjung Harapan'],
  'KOTA PARIAMAN': ['Pariaman Selatan', 'Pariaman Tengah', 'Pariaman Timur', 'Pariaman Utara'],

  'KOTA PEKANBARU': ['Bukit Raya', 'Lima Puluh', 'Marpoyan Damai', 'Payung Sekaki', 'Pekanbaru Kota', 'Rumbai', 'Rumbai Pesisir', 'Sail', 'Senapelan', 'Sukajadi', 'Tampan', 'Tenayan Raya'],
  'KOTA DUMAI': ['Bukit Kapur', 'Dumai Barat', 'Dumai Kota', 'Dumai Selatan', 'Dumai Timur', 'Medang Kampai', 'Sungai Sembilan'],

  'KOTA BATAM': ['Batam Kota', 'Batu Aji', 'Batu Ampar', 'Bengkong', 'Bulang', 'Galang', 'Lubuk Baja', 'Nongsa', 'Sagulung', 'Sei Beduk', 'Sekupang', 'Belakang Padang'],
  'KOTA TANJUNGPINANG': ['Bukit Bestari', 'Tanjungpinang Barat', 'Tanjungpinang Kota', 'Tanjungpinang Timur'],

  'KOTA JAMBI': ['Danau Sipin', 'Jambi Selatan', 'Jambi Timur', 'Jelutung', 'Kota Baru', 'Alam Barajo', 'Pasar Jambi', 'Pelayangan', 'Telanaipura', 'Paal Merah', 'Danau Teluk'],
  'KOTA SUNGAI PENUH': ['Sungai Penuh', 'Hamparan Rawang', 'Pesisir Bukit', 'Tanah Kampung', 'Kumun Debai', 'Pondok Tinggi', 'Koto Baru', 'Tanjung Pauh Mudik'],

  'KOTA PALEMBANG': ['Alang-Alang Lebar', 'Bukit Kecil', 'Gandus', 'Ilir Barat I', 'Ilir Barat II', 'Ilir Timur I', 'Ilir Timur II', 'Ilir Timur III', 'Kalidoni', 'Kemuning', 'Kertapati', 'Plaju', 'Sako', 'Seberang Ulu I', 'Seberang Ulu II', 'Sematang Borang', 'Sukarami', 'Jakabaring'],
  'KOTA PRABUMULIH': ['Cambai', 'Prabumulih Barat', 'Prabumulih Selatan', 'Prabumulih Timur', 'Prabumulih Utara', 'Rambang Kapak Tengah'],
  'KOTA PAGAR ALAM': ['Dempo Selatan', 'Dempo Tengah', 'Dempo Utara', 'Pagar Alam Selatan', 'Pagar Alam Utara'],
  'KOTA LUBUKLINGGAU': ['Lubuklinggau Barat I', 'Lubuklinggau Barat II', 'Lubuklinggau Selatan I', 'Lubuklinggau Selatan II', 'Lubuklinggau Timur I', 'Lubuklinggau Timur II', 'Lubuklinggau Utara I', 'Lubuklinggau Utara II'],

  'KOTA PANGKALPINANG': ['Bukit Intan', 'Gabek', 'Girimaya', 'Gerunggang', 'Pangkalbalam', 'Rangkui', 'Taman Sari'],

  'KOTA BENGKULU': ['Gading Cempaka', 'Kampung Melayu', 'Muara Bangka Hulu', 'Ratu Agung', 'Ratu Samban', 'Selebar', 'Singaran Pati', 'Sungai Serut', 'Teluk Segara'],

  'KOTA BANDAR LAMPUNG': ['Bumi Waras', 'Enggal', 'Kedamaian', 'Kedaton', 'Kemiling', 'Labuhan Ratu', 'Langkapura', 'Panjang', 'Rajabasa', 'Sukabumi', 'Sukarame', 'Tanjung Karang Barat', 'Tanjung Karang Pusat', 'Tanjung Karang Timur', 'Tanjung Senang', 'Teluk Betung Barat', 'Teluk Betung Selatan', 'Teluk Betung Timur', 'Teluk Betung Utara', 'Way Halim'],
  'KOTA METRO': ['Metro Barat', 'Metro Pusat', 'Metro Selatan', 'Metro Timur', 'Metro Utara'],

  'KOTA JAKARTA PUSAT': ['Cempaka Putih', 'Gambir', 'Johar Baru', 'Kemayoran', 'Menteng', 'Sawah Besar', 'Senen', 'Tanah Abang'],
  'KOTA JAKARTA UTARA': ['Cilincing', 'Kelapa Gading', 'Koja', 'Pademangan', 'Penjaringan', 'Tanjung Priok'],
  'KOTA JAKARTA BARAT': ['Cengkareng', 'Grogol Petamburan', 'Kalideres', 'Kebon Jeruk', 'Kembangan', 'Palmerah', 'Taman Sari', 'Tambora'],
  'KOTA JAKARTA SELATAN': ['Cilandak', 'Jagakarsa', 'Kebayoran Baru', 'Kebayoran Lama', 'Mampang Prapatan', 'Pancoran', 'Pasar Minggu', 'Pesanggrahan', 'Setiabudi', 'Tebet'],
  'KOTA JAKARTA TIMUR': ['Cakung', 'Cipayung', 'Ciracas', 'Duren Sawit', 'Jatinegara', 'Kramat Jati', 'Makasar', 'Matraman', 'Pasar Rebo', 'Pulo Gadung'],

  'KOTA TANGERANG': ['Batuceper', 'Benda', 'Cibodas', 'Ciledug', 'Cipondoh', 'Jatiuwung', 'Karang Tengah', 'Karawaci', 'Larangan', 'Neglasari', 'Periuk', 'Pinang', 'Tangerang'],
  'KOTA CILEGON': ['Cibeber', 'Cilegon', 'Citangkil', 'Ciwandan', 'Grogol', 'Jombang', 'Pulomerak', 'Purwakarta'],
  'KOTA SERANG': ['Serang', 'Cipocok Jaya', 'Curug', 'Kasemen', 'Taktakan', 'Walantaka'],
  'KOTA TANGERANG SELATAN': ['Ciputat', 'Ciputat Timur', 'Pamulang', 'Pondok Aren', 'Serpong', 'Serpong Utara', 'Setu'],

  'KOTA BANDUNG': ['Andir', 'Antapani', 'Arcamanik', 'Astana Anyar', 'Babakan Ciparay', 'Bandung Kidul', 'Bandung Kulon', 'Bandung Wetan', 'Batununggal', 'Bojongloa Kaler', 'Bojongloa Kidul', 'Buahbatu', 'Cibeunying Kaler', 'Cibeunying Kidul', 'Cibiru', 'Cicendo', 'Cidadap', 'Cinambo', 'Coblong', 'Gedebage', 'Kiaracondong', 'Lengkong', 'Mandalajati', 'Panyileukan', 'Rancasari', 'Regol', 'Sukajadi', 'Sukasari', 'Sumur Bandung', 'Ujungberung'],
  'KOTA BEKASI': ['Bantargebang', 'Bekasi Barat', 'Bekasi Selatan', 'Bekasi Timur', 'Bekasi Utara', 'Jatiasih', 'Jatisampurna', 'Medan Satria', 'Mustika Jaya', 'Pondok Gede', 'Pondok Melati', 'Rawalumbu'],
  'KOTA BOGOR': ['Bogor Barat', 'Bogor Selatan', 'Bogor Tengah', 'Bogor Timur', 'Bogor Utara', 'Tanah Sareal'],
  'KOTA CIMAHI': ['Cimahi Selatan', 'Cimahi Tengah', 'Cimahi Utara'],
  'KOTA CIREBON': ['Harjamukti', 'Kejaksan', 'Kesambi', 'Lemahwungkuk', 'Pekalipan'],
  'KOTA DEPOK': ['Beji', 'Bojongsari', 'Cilodong', 'Cimanggis', 'Cinere', 'Cipayung', 'Limo', 'Pancoran Mas', 'Sawangan', 'Sukmajaya', 'Tapos'],
  'KOTA SUKABUMI': ['Baros', 'Cibeureum', 'Cikole', 'Citamiang', 'Gunung Puyuh', 'Lembursitu', 'Warudoyong'],
  'KOTA TASIKMALAYA': ['Bungursari', 'Cibeureum', 'Cihideung', 'Cipedes', 'Indihiang', 'Kawalu', 'Mangkubumi', 'Purbaratu', 'Tamansari', 'Tawang'],
  'KOTA BANJAR': ['Banjar', 'Langensari', 'Pataruman', 'Purwaharja'],

  'KOTA SEMARANG': ['Banyumanik', 'Candisari', 'Gajahmungkur', 'Gayamsari', 'Genuk', 'Gunungpati', 'Mijen', 'Ngaliyan', 'Pedurungan', 'Semarang Barat', 'Semarang Selatan', 'Semarang Tengah', 'Semarang Timur', 'Semarang Utara', 'Tembalang', 'Tugu'],
  'KOTA SURAKARTA': ['Banjarsari', 'Jebres', 'Laweyan', 'Pasar Kliwon', 'Serengan'],
  'KOTA SALATIGA': ['Argomulyo', 'Sidomukti', 'Sidorejo', 'Tingkir'],
  'KOTA MAGELANG': ['Magelang Selatan', 'Magelang Tengah', 'Magelang Utara'],
  'KOTA PEKALONGAN': ['Pekalongan Barat', 'Pekalongan Selatan', 'Pekalongan Timur', 'Pekalongan Utara'],
  'KOTA TEGAL': ['Tegal Barat', 'Tegal Selatan', 'Tegal Timur', 'Margadana'],

  'KOTA YOGYAKARTA': ['Danurejan', 'Gedongtengen', 'Gondokusuman', 'Gondomanan', 'Jetis', 'Kotagede', 'Kraton', 'Mantrijeron', 'Mergangsan', 'Ngampilan', 'Pakualaman', 'Tegalrejo', 'Umbulharjo', 'Wirobrajan'],

  'KOTA SURABAYA': ['Asemrowo', 'Benowo', 'Bubutan', 'Bulak', 'Dukuh Pakis', 'Gayungan', 'Genteng', 'Gubeng', 'Gunung Anyar', 'Jambangan', 'Karangpilang', 'Kenjeran', 'Krembangan', 'Lakarsantri', 'Mulyorejo', 'Pabean Cantian', 'Pakal', 'Rungkut', 'Sambikerep', 'Sawahan', 'Semampir', 'Simokerto', 'Sukolilo', 'Sukomanunggal', 'Tambaksari', 'Tandes', 'Tegalsari', 'Tenggilis Mejoyo', 'Wiyung', 'Wonocolo', 'Wonokromo'],
  'KOTA MALANG': ['Blimbing', 'Kedungkandang', 'Klojen', 'Lowokwaru', 'Sukun'],
  'KOTA MADIUN': ['Kartoharjo', 'Manguharjo', 'Taman'],
  'KOTA KEDIRI': ['Kota', 'Mojoroto', 'Pesantren'],
  'KOTA MOJOKERTO': ['Magersari', 'Prajurit Kulon'],
  'KOTA PASURUAN': ['Bugul Kidul', 'Gadingrejo', 'Panggungrejo', 'Purworejo'],
  'KOTA PROBOLINGGO': ['Kademangan', 'Kanigaran', 'Kedopok', 'Mayangan', 'Wonoasih'],
  'KOTA BLITAR': ['Kepanjenkidul', 'Sananwetan', 'Sukorejo'],
  'KOTA BATU': ['Batu', 'Bumiaji', 'Junrejo'],

  'KOTA DENPASAR': ['Denpasar Barat', 'Denpasar Selatan', 'Denpasar Timur', 'Denpasar Utara'],

  'KOTA MATARAM': ['Ampenan', 'Cakranegara', 'Mataram', 'Sandubaya', 'Sekarbela', 'Selaparang'],
  'KOTA BIMA': ['Asakota', 'Mpunda', 'Raba', 'Rasanae Barat', 'Rasanae Timur'],

  'KOTA KUPANG': ['Alak', 'Kelapa Lima', 'Kota Lama', 'Kota Raja', 'Maulafa', 'Oebobo'],

  'KOTA PONTIANAK': ['Pontianak Barat', 'Pontianak Kota', 'Pontianak Selatan', 'Pontianak Tenggara', 'Pontianak Timur', 'Pontianak Utara'],
  'KOTA SINGKAWANG': ['Singkawang Barat', 'Singkawang Selatan', 'Singkawang Tengah', 'Singkawang Timur', 'Singkawang Utara'],

  'KOTA PALANGKA RAYA': ['Bukit Batu', 'Jekan Raya', 'Pahandut', 'Rakumpit', 'Sabangau'],

  'KOTA BANJARMASIN': ['Banjarmasin Barat', 'Banjarmasin Selatan', 'Banjarmasin Tengah', 'Banjarmasin Timur', 'Banjarmasin Utara'],
  'KOTA BANJARBARU': ['Banjarbaru Selatan', 'Banjarbaru Utara', 'Cempaka', 'Landasan Ulin', 'Liang Anggang'],

  'KOTA SAMARINDA': ['Loa Janan Ilir', 'Palaran', 'Samarinda Ilir', 'Samarinda Kota', 'Samarinda Seberang', 'Samarinda Ulu', 'Samarinda Utara', 'Sambutan', 'Sungai Kunjang', 'Sungai Pinang'],
  'KOTA BALIKPAPAN': ['Balikpapan Barat', 'Balikpapan Kota', 'Balikpapan Selatan', 'Balikpapan Tengah', 'Balikpapan Timur', 'Balikpapan Utara'],
  'KOTA BONTANG': ['Bontang Barat', 'Bontang Selatan', 'Bontang Utara'],

  'KOTA TARAKAN': ['Tarakan Barat', 'Tarakan Tengah', 'Tarakan Timur', 'Tarakan Utara'],

  'KOTA MANADO': ['Bunaken', 'Malalayang', 'Mapanget', 'Paal Dua', 'Sario', 'Singkil', 'Tikala', 'Tuminting', 'Wanea', 'Wenang'],
  'KOTA BITUNG': ['Aertembaga', 'Girian', 'Lembeh Selatan', 'Lembeh Utara', 'Madidir', 'Matuari', 'Ranowulu'],
  'KOTA TOMOHON': ['Tomohon Barat', 'Tomohon Selatan', 'Tomohon Tengah', 'Tomohon Timur', 'Tomohon Utara'],
  'KOTA KOTAMOBAGU': ['Kotamobagu Barat', 'Kotamobagu Selatan', 'Kotamobagu Timur', 'Kotamobagu Utara'],

  'KOTA GORONTALO': ['Dumbo Raya', 'Hulonthalangi', 'Kota Barat', 'Kota Selatan', 'Kota Tengah', 'Kota Timur', 'Kota Utara', 'Sipatana'],

  'KOTA PALU': ['Palu Barat', 'Palu Selatan', 'Palu Timur', 'Palu Utara', 'Tatanga', 'Tawaeli', 'Ulujadi', 'Mantikulore'],

  'KOTA MAKASSAR': ['Biringkanaya', 'Bontoala', 'Makassar', 'Mamajang', 'Manggala', 'Mariso', 'Panakkukang', 'Rappocini', 'Tallo', 'Tamalanrea', 'Tamalate', 'Ujung Pandang', 'Ujung Tanah', 'Wajo'],
  'KOTA PAREPARE': ['Bacukiki', 'Bacukiki Barat', 'Soreang', 'Ujung'],
  'KOTA PALOPO': ['Wara', 'Wara Barat', 'Wara Selatan', 'Wara Timur', 'Wara Utara', 'Mungkajang', 'Sendana', 'Telluwanua', 'Bara'],

  'KOTA KENDARI': ['Abeli', 'Baruga', 'Kadia', 'Kambu', 'Kendari', 'Kendari Barat', 'Mandonga', 'Poasia', 'Puuwatu', 'Wua-Wua'],
  'KOTA BAUBAU': ['Batupoaro', 'Betoambari', 'Bungi', 'Kokalukuna', 'Lea-Lea', 'Murhum', 'Sorawolio', 'Wolio'],

  'KOTA AMBON': ['Baguala', 'Leitimur Selatan', 'Nusaniwe', 'Sirimau', 'Teluk Ambon'],
  'KOTA TUAL': ['Dullah Selatan', 'Dullah Utara', 'Pulau Dullah Utara', 'Pulau-Pulau Kur', 'Tayando Tam'],

  'KOTA TERNATE': ['Moti', 'Pulau Batang Dua', 'Pulau Ternate', 'Ternate Selatan', 'Ternate Tengah', 'Ternate Utara'],
  'KOTA TIDORE KEPULAUAN': ['Oba', 'Oba Selatan', 'Oba Tengah', 'Oba Utara', 'Tidore', 'Tidore Selatan', 'Tidore Timur', 'Tidore Utara'],

  'KOTA JAYAPURA': ['Abepura', 'Heram', 'Jayapura Selatan', 'Jayapura Utara', 'Muara Tami'],

  'KOTA SORONG': ['Sorong', 'Sorong Barat', 'Sorong Kepulauan', 'Sorong Kota', 'Sorong Manoi', 'Sorong Timur', 'Sorong Utara'],

  // Selected major regencies (kabupaten) with high logistics/industrial relevance.
  'KABUPATEN BOGOR': ['Cibinong', 'Cileungsi', 'Citeureup', 'Gunung Putri', 'Klapanunggal', 'Cariu', 'Jonggol', 'Sukaraja', 'Bojonggede', 'Cibungbulang', 'Ciampea', 'Ciawi', 'Cigudeg', 'Cijeruk', 'Cisarua', 'Gunung Sindur', 'Jasinga', 'Leuwiliang', 'Megamendung', 'Parung', 'Rumpin', 'Tenjo', 'Babakan Madang'],
  'KABUPATEN BANDUNG': ['Baleendah', 'Banjaran', 'Bojongsoang', 'Cicalengka', 'Cileunyi', 'Cimenyan', 'Ciparay', 'Dayeuhkolot', 'Katapang', 'Majalaya', 'Margahayu', 'Margaasih', 'Rancaekek', 'Soreang'],
  'KABUPATEN BANDUNG BARAT': ['Batujajar', 'Cihampelas', 'Cikalongwetan', 'Cililin', 'Cipatat', 'Cisarua', 'Lembang', 'Padalarang', 'Ngamprah'],
  'KABUPATEN BEKASI': ['Cibitung', 'Cikarang Barat', 'Cikarang Pusat', 'Cikarang Selatan', 'Cikarang Timur', 'Cikarang Utara', 'Setu', 'Tambun Selatan', 'Tambun Utara', 'Serang Baru'],
  'KABUPATEN KARAWANG': ['Karawang Barat', 'Karawang Timur', 'Klari', 'Cikampek', 'Kotabaru', 'Purwasari', 'Telukjambe Barat', 'Telukjambe Timur'],
  'KABUPATEN PURWAKARTA': ['Purwakarta', 'Babakancikao', 'Campaka', 'Jatiluhur', 'Bungursari'],
  'KABUPATEN SUBANG': ['Subang', 'Cibogo', 'Cikaum', 'Pagaden', 'Pamanukan'],
  'KABUPATEN SUKABUMI': ['Cibadak', 'Cicurug', 'Cisaat', 'Palabuhanratu', 'Parungkuda'],
  'KABUPATEN CIANJUR': ['Cianjur', 'Cilaku', 'Karangtengah', 'Sukaluyu', 'Cipanas'],
  'KABUPATEN GARUT': ['Garut Kota', 'Tarogong Kidul', 'Tarogong Kaler', 'Leles', 'Cibatu'],
  'KABUPATEN TASIKMALAYA': ['Singaparna', 'Ciawi', 'Manonjaya', 'Sukaraja', 'Rajapolah'],
  'KABUPATEN CIREBON': ['Sumber', 'Weru', 'Plered', 'Arjawinangun', 'Palimanan'],
  'KABUPATEN INDRAMAYU': ['Indramayu', 'Jatibarang', 'Karangampel', 'Sindang', 'Haurgeulis'],
  'KABUPATEN SUMEDANG': ['Sumedang Selatan', 'Sumedang Utara', 'Cimalaka', 'Jatinangor', 'Tanjungsari'],
  'KABUPATEN MAJALENGKA': ['Majalengka', 'Kadipaten', 'Jatiwangi', 'Rajagaluh'],
  'KABUPATEN KUNINGAN': ['Kuningan', 'Cilimus', 'Ciawigebang', 'Kadugede'],

  'KABUPATEN SLEMAN': ['Depok', 'Gamping', 'Godean', 'Kalasan', 'Mlati', 'Ngaglik', 'Ngemplak', 'Pakem', 'Prambanan', 'Sleman', 'Turi', 'Tempel', 'Berbah', 'Cangkringan', 'Minggir', 'Moyudan', 'Seyegan'],
  'KABUPATEN BANTUL': ['Bantul', 'Banguntapan', 'Jetis', 'Kasihan', 'Sewon', 'Pleret', 'Piyungan', 'Sedayu'],
  'KABUPATEN GUNUNGKIDUL': ['Wonosari', 'Playen', 'Semanu', 'Karangmojo', 'Ponjong'],
  'KABUPATEN KULON PROGO': ['Wates', 'Pengasih', 'Sentolo', 'Nanggulan', 'Temon'],

  'KABUPATEN SIDOARJO': ['Sidoarjo', 'Buduran', 'Candi', 'Gedangan', 'Krian', 'Porong', 'Sedati', 'Taman', 'Tanggulangin', 'Waru', 'Wonoayu'],
  'KABUPATEN GRESIK': ['Gresik', 'Kebomas', 'Manyar', 'Cerme', 'Driyorejo', 'Menganti'],
  'KABUPATEN MOJOKERTO': ['Mojosari', 'Sooko', 'Puri', 'Trowulan', 'Dlanggu'],
  'KABUPATEN PASURUAN': ['Bangil', 'Gempol', 'Rembang', 'Beji', 'Pandaan'],
  'KABUPATEN MALANG': ['Kepanjen', 'Singosari', 'Lawang', 'Dau', 'Turen', 'Pakis', 'Tumpang'],
  'KABUPATEN JEMBER': ['Jember', 'Kaliwates', 'Patrang', 'Sumbersari', 'Rambipuji'],
  'KABUPATEN BANYUWANGI': ['Banyuwangi', 'Giri', 'Glagah', 'Kalipuro', 'Rogojampi'],
  'KABUPATEN KEDIRI': ['Pare', 'Kandat', 'Ngasem', 'Wates', 'Ngadiluwih'],
  'KABUPATEN TUBAN': ['Tuban', 'Jenu', 'Merakurak', 'Semanding'],
  'KABUPATEN LAMONGAN': ['Lamongan', 'Babat', 'Brondong', 'Paciran'],
  'KABUPATEN BOJONEGORO': ['Bojonegoro', 'Kapas', 'Kalitidu', 'Dander'],

  'KABUPATEN BADUNG': ['Kuta', 'Kuta Selatan', 'Kuta Utara', 'Mengwi', 'Abiansemal', 'Petang'],
  'KABUPATEN GIANYAR': ['Gianyar', 'Ubud', 'Sukawati', 'Tegallalang', 'Tampaksiring', 'Blahbatuh', 'Payangan'],
  'KABUPATEN TABANAN': ['Tabanan', 'Kediri', 'Marga', 'Kerambitan', 'Baturiti'],
  'KABUPATEN BULELENG': ['Buleleng', 'Sukasada', 'Banjar', 'Seririt', 'Kubutambahan'],

  'KABUPATEN DELI SERDANG': ['Lubuk Pakam', 'Tanjung Morawa', 'Percut Sei Tuan', 'Deli Tua', 'Sunggal', 'Pancur Batu', 'Batang Kuis', 'Namorambe'],
  'KABUPATEN LANGKAT': ['Stabat', 'Tanjung Pura', 'Pangkalan Brandan', 'Binjai', 'Selesai'],
  'KABUPATEN KARO': ['Kabanjahe', 'Berastagi', 'Tigapanah', 'Simpang Empat'],
  'KABUPATEN SIMALUNGUN': ['Pematang Raya', 'Siantar', 'Tanah Jawa', 'Perdagangan'],

  'KABUPATEN KAMPAR': ['Bangkinang', 'Bangkinang Kota', 'Kampar', 'Siak Hulu', 'Tapung'],
  'KABUPATEN BENGKALIS': ['Bengkalis', 'Mandau', 'Pinggir', 'Rupat'],
  'KABUPATEN SIAK': ['Siak', 'Minas', 'Kandis', 'Tualang'],

  'KABUPATEN MUSI BANYUASIN': ['Sekayu', 'Sungai Lilin', 'Babat Toman', 'Bayung Lencir'],
  'KABUPATEN OGAN KOMERING ILIR': ['Kayuagung', 'Tulung Selapan', 'Pedamaran', 'Lempuing'],

  'KABUPATEN TANGERANG': ['Balaraja', 'Cikupa', 'Curug', 'Kelapa Dua', 'Pasar Kemis', 'Tigaraksa', 'Legok', 'Panongan', 'Cisauk'],
  'KABUPATEN SERANG': ['Ciruas', 'Kragilan', 'Kramatwatu', 'Anyar', 'Pontang'],
  'KABUPATEN LEBAK': ['Rangkasbitung', 'Malingping', 'Maja', 'Cipanas'],
  'KABUPATEN PANDEGLANG': ['Pandeglang', 'Labuan', 'Panimbang', 'Menes'],

  'KABUPATEN KUTAI KARTANEGARA': ['Tenggarong', 'Loa Janan', 'Muara Badak', 'Sebulu', 'Marangkayu', 'Samboja'],
  'KABUPATEN BERAU': ['Tanjung Redeb', 'Teluk Bayur', 'Gunung Tabur', 'Sambaliung'],
  'KABUPATEN PASER': ['Tanah Grogot', 'Batu Sopang', 'Long Ikis'],
  'KABUPATEN PENAJAM PASER UTARA': ['Penajam', 'Waru', 'Babulu', 'Sepaku'],

  'KABUPATEN BANYUMAS': ['Purwokerto Utara', 'Purwokerto Selatan', 'Purwokerto Timur', 'Purwokerto Barat', 'Sokaraja', 'Baturraden'],
  'KABUPATEN CILACAP': ['Cilacap Utara', 'Cilacap Selatan', 'Cilacap Tengah', 'Sidareja', 'Majenang', 'Kroya'],
  'KABUPATEN KEBUMEN': ['Kebumen', 'Gombong', 'Karanganyar', 'Petanahan'],
  'KABUPATEN PURWOREJO': ['Purworejo', 'Kutoarjo', 'Bagelen', 'Kemiri'],
  'KABUPATEN MAGELANG': ['Mungkid', 'Muntilan', 'Mertoyudan', 'Salam', 'Borobudur'],
  'KABUPATEN KLATEN': ['Klaten Utara', 'Klaten Tengah', 'Klaten Selatan', 'Delanggu', 'Prambanan'],
  'KABUPATEN SUKOHARJO': ['Sukoharjo', 'Grogol', 'Baki', 'Kartasura'],
  'KABUPATEN BOYOLALI': ['Boyolali', 'Ampel', 'Banyudono', 'Mojosongo'],
  'KABUPATEN SRAGEN': ['Sragen', 'Gemolong', 'Kalijambe', 'Sambungmacan'],
  'KABUPATEN KARANGANYAR': ['Karanganyar', 'Colomadu', 'Jaten', 'Palur'],
  'KABUPATEN WONOGIRI': ['Wonogiri', 'Baturetno', 'Purwantoro', 'Jatisrono'],
  'KABUPATEN KUDUS': ['Kota Kudus', 'Kaliwungu', 'Jati', 'Gebog', 'Mejobo'],
  'KABUPATEN JEPARA': ['Jepara', 'Tahunan', 'Pecangaan', 'Batealit'],
  'KABUPATEN DEMAK': ['Demak', 'Mranggen', 'Karangawen', 'Sayung'],
  'KABUPATEN PATI': ['Pati', 'Juwana', 'Tayu', 'Margoyoso'],
  'KABUPATEN GROBOGAN': ['Purwodadi', 'Godong', 'Gubug', 'Wirosari'],
  'KABUPATEN PEKALONGAN': ['Kajen', 'Kedungwuni', 'Wiradesa', 'Buaran'],
  'KABUPATEN TEGAL': ['Slawi', 'Adiwerna', 'Dukuhturi', 'Talang'],
  'KABUPATEN BREBES': ['Brebes', 'Bumiayu', 'Tanjung', 'Losari'],
  'KABUPATEN TEMANGGUNG': ['Temanggung', 'Parakan', 'Kedu', 'Kranggan'],

  'KABUPATEN GOWA': ['Sungguminasa', 'Somba Opu', 'Pallangga', 'Bajeng'],
  'KABUPATEN MAROS': ['Turikale', 'Maros Baru', 'Mandai', 'Camba'],
  'KABUPATEN BONE': ['Watampone', 'Tanete Riattang', 'Awangpone', 'Barebbo'],
  'KABUPATEN WAJO': ['Sengkang', 'Tempe', 'Belawa', 'Maniangpajo'],
  'KABUPATEN PINRANG': ['Pinrang', 'Watang Sawitto', 'Suppa', 'Duampanua'],
  'KABUPATEN BULUKUMBA': ['Bulukumba', 'Ujung Bulu', 'Gantarang', 'Kajang'],

  'KABUPATEN MINAHASA': ['Tondano Barat', 'Tondano Timur', 'Tondano Utara', 'Tondano Selatan', 'Kakas', 'Langowan'],
  'KABUPATEN MINAHASA UTARA': ['Airmadidi', 'Kalawat', 'Kauditan', 'Likupang Timur'],

  'KABUPATEN LOMBOK BARAT': ['Gerung', 'Kediri', 'Narmada', 'Gunungsari', 'Labuapi'],
  'KABUPATEN LOMBOK TENGAH': ['Praya', 'Praya Barat', 'Praya Timur', 'Batukliang', 'Pujut'],
  'KABUPATEN LOMBOK TIMUR': ['Selong', 'Masbagik', 'Pringgabaya', 'Aikmel', 'Sakra'],

  'KABUPATEN KUPANG': ['Kupang Barat', 'Kupang Timur', 'Kupang Tengah', 'Sulamu', 'Amarasi'],
  'KABUPATEN SIKKA': ['Alok', 'Maumere', 'Nita', 'Lela'],
  'KABUPATEN MANGGARAI': ['Ruteng', 'Langke Rembong', 'Cibal', 'Reok'],

  'KABUPATEN SAMBAS': ['Sambas', 'Pemangkat', 'Tebas', 'Selakau'],
  'KABUPATEN KUBU RAYA': ['Sungai Raya', 'Sungai Ambawang', 'Rasau Jaya', 'Kuala Mandor B'],
  'KABUPATEN KETAPANG': ['Ketapang', 'Delta Pawan', 'Muara Pawan', 'Benua Kayong'],

  'KABUPATEN KOTAWARINGIN TIMUR': ['Sampit', 'Baamang', 'Ketapang', 'Kota Besi'],
  'KABUPATEN KOTAWARINGIN BARAT': ['Pangkalan Bun', 'Arut Selatan', 'Arut Utara', 'Kumai'],

  'KABUPATEN BANJAR': ['Martapura', 'Martapura Barat', 'Martapura Timur', 'Gambut', 'Karang Intan'],
  'KABUPATEN TANAH LAUT': ['Pelaihari', 'Bati-Bati', 'Kurau', 'Takisung'],
  'KABUPATEN TABALONG': ['Tanjung', 'Murung Pudak', 'Kelua', 'Muara Uya'],

  'KABUPATEN MUARO JAMBI': ['Sengeti', 'Jambi Luar Kota', 'Mestong', 'Kumpeh'],
  'KABUPATEN BATANGHARI': ['Muara Bulian', 'Muara Tembesi', 'Mersam', 'Batin XXIV'],

  'KABUPATEN AGAM': ['Lubuk Basung', 'Tilatang Kamang', 'Baso', 'Ampek Angkek'],
  'KABUPATEN PADANG PARIAMAN': ['Pariaman', 'Lubuk Alung', 'Sicincin', 'VII Koto Sungai Sarik'],
  'KABUPATEN TANAH DATAR': ['Batusangkar', 'Lima Kaum', 'Rambatan', 'Pariangan'],
  'KABUPATEN LIMA PULUH KOTA': ['Payakumbuh', 'Harau', 'Guguak', 'Situjuah Limo Nagari'],

  'KABUPATEN BIREUEN': ['Bireuen', 'Peusangan', 'Jeumpa', 'Juli'],
  'KABUPATEN ACEH BESAR': ['Kota Jantho', 'Ingin Jaya', 'Baitussalam', 'Darussalam', 'Peukan Bada'],
  'KABUPATEN ACEH UTARA': ['Lhoksukon', 'Muara Batu', 'Dewantara', 'Syamtalira Aron'],
  'KABUPATEN PIDIE': ['Sigli', 'Kembang Tanjong', 'Mutiara', 'Delima'],

  'KABUPATEN BELITUNG': ['Tanjungpandan', 'Membalong', 'Badau', 'Sijuk'],
  'KABUPATEN BANGKA': ['Sungailiat', 'Pemali', 'Merawang', 'Puding Besar'],

  'KABUPATEN LAMPUNG SELATAN': ['Kalianda', 'Natar', 'Jati Agung', 'Sidomulyo'],
  'KABUPATEN LAMPUNG TENGAH': ['Gunung Sugih', 'Terbanggi Besar', 'Bandar Jaya', 'Kalirejo'],
  'KABUPATEN PESAWARAN': ['Gedong Tataan', 'Kedondong', 'Padang Cermin', 'Way Lima'],

  'KABUPATEN REJANG LEBONG': ['Curup', 'Curup Timur', 'Curup Utara', 'Selupu Rejang'],
  'KABUPATEN BENGKULU UTARA': ['Argamakmur', 'Putri Hijau', 'Ketahun', 'Air Napal'],
}

export function kecamatanOptionsFor(region) {
  const list = KECAMATAN_BY_REGION[region]
  if (!list) return []
  return list.map((k) => ({ value: `KECAMATAN ${k.toUpperCase()}`, label: `Kecamatan ${k}` }))
}
