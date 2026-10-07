/* ==========================================================================
   ZTEX Construction — Public site language toggle (English / Spanish)

   Loaded before main.js. English stays in the HTML as the fallback; elements
   carry data-i18n (text), data-i18n-html (trusted markup from this file) or
   data-i18n-<attribute> (placeholder, aria-label, title, alt, content).
   main.js uses I18n.t(key, vars) for strings it builds at runtime.
   ========================================================================== */

(function () {
    const STORAGE_KEY = 'ztex_lang';
    const LANGS = ['en', 'es'];
    const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'content'];

    const dict = {
        en: {
            // Meta
            'meta.title': 'ZTEX Construction — Sponsorship Requests',
            'meta.description': 'Submit your sponsorship request to ZTEX Construction, Inc.',
            'meta.thanksTitle': 'Request Received — ZTEX Construction',
            'meta.thanksDescription': 'Your sponsorship request has been received. ZTEX Construction will follow up within 5-7 business days.',

            // Navigation + language toggle
            'nav.about': 'About',
            'nav.apply': 'Apply',
            'nav.mainSite': 'Main Site',
            'lang.label': 'Language',
            'lang.en': 'English',
            'lang.es': 'Spanish',

            // Hero
            'hero.badge': 'Community Investment',
            'hero.title1': 'Sponsorship',
            'hero.title2': 'Requests',
            'hero.subtitle': 'ZTEX Construction is proud to invest in the communities we build. Submit your sponsorship request below and let\'s make an impact together.',
            'hero.cta': 'Submit a Request',
            'hero.scroll': 'Scroll',

            // About
            'about.tag': 'Our Commitment',
            'about.title': 'Community<br><em>Investment</em>',
            'about.p1': 'For over two decades, ZTEX Construction has been more than a heavy civil contractor — we\'ve been a cornerstone of the El Paso and Southern New Mexico communities. Our sponsorship program reflects our belief that building stronger communities starts beyond the jobsite.',
            'about.p2': 'We welcome sponsorship requests from organizations, events, and causes that align with our values of integrity, community, and growth.',
            'about.statYears': 'Years Serving El Paso',
            'about.statTeam': 'Team Members Strong',
            'about.statStates': 'States — TX & NM',

            // Form header + progress
            'form.tag': 'Get Started',
            'form.title': 'Submit Your<br><em>Sponsorship Request</em>',
            'form.intro': 'Please complete the form below with details about your organization and event. Our team will review your request and follow up within 5-7 business days.',
            'form.step1': 'Organization',
            'form.step2': 'Event Details',
            'form.step3': 'Upload & Submit',
            'form.continue': 'Continue',
            'form.back': 'Back',
            'form.submit': 'Submit Request',
            'form.submitting': 'Submitting...',

            // Step 1
            'field.orgName': 'Organization / Company Name',
            'field.orgName.placeholder': 'Your organization name',
            'field.orgName.error': 'Please enter your organization name',
            'field.contactName': 'Contact Name',
            'field.contactName.placeholder': 'Full name',
            'field.contactName.error': 'Please enter a contact name',
            'field.email': 'Email Address',
            'field.email.placeholder': 'email@example.com',
            'field.email.error': 'Please enter a valid email address',
            'field.phone': 'Phone Number',
            'field.phone.error': 'Please enter a phone number',

            // Step 2
            'field.eventName': 'Event / Sponsorship Name',
            'field.eventName.placeholder': 'Name of event or initiative',
            'field.eventName.error': 'Please enter the event name',
            'field.eventDate': 'Event Date',
            'field.eventDate.error': 'Please enter the event date',
            'field.eventTime': 'Event Start Time (Mountain Time)',
            'field.amount': 'Sponsorship Amount Requested',
            'field.tier': 'Sponsorship Tier / Level',
            'tier.select': 'Select a tier (if applicable)',
            'tier.titleSponsor': 'Title Sponsor',
            'tier.platinum': 'Platinum',
            'tier.gold': 'Gold',
            'tier.silver': 'Silver',
            'tier.bronze': 'Bronze',
            'tier.inKind': 'In-Kind',
            'tier.notApplicable': 'Not Applicable',
            'tier.other': 'Other',
            'field.tierOther': 'Describe the Tier / Level',
            'field.tierOther.placeholder': 'e.g. Hole sponsor, Naming rights',
            'field.tierOther.error': 'Please describe the tier',
            'field.description': 'Description of Event / Cause',
            'field.description.placeholder': 'Tell us about your event, its purpose, expected attendance, and how ZTEX\'s sponsorship would make an impact...',
            'field.description.error': 'Please provide a description',

            // Step 3
            'files.label': 'Upload Files',
            'files.hint': 'Attach flyers, proposals, event details, or any supporting documents. (Max 10MB per file, 20MB total, up to 5 files)',
            'files.drop': 'Drag & drop files here, or <span class="file-upload-browse">browse</span>',
            'files.formats': 'PDF, JPG, PNG, DOC, DOCX — Max 10MB each',
            'files.remove': 'Remove file',
            'field.notes': 'Additional Notes',
            'field.notes.placeholder': 'Anything else you\'d like us to know...',

            // Inline success (kept for resetForm)
            'success.title': 'Request Submitted!',
            'success.text': 'Thank you for your sponsorship request. Our team will review your submission and get back to you within 5-7 business days.',
            'success.again': 'Submit Another Request',

            // Footer
            'footer.contact': 'Contact',
            'footer.links': 'Links',
            'footer.mainSite': 'Main Website',
            'footer.projects': 'Our Projects',
            'footer.copyright': '© 2026 ZTEX Construction, Inc. All rights reserved.',
            'footer.eeo': 'ZTEX Construction INC. does not discriminate on the basis of race, color, religion, gender, sex, national origin, age, disability, military status, genetic information, or any other basis prohibited by law.',

            // Thanks page
            'thanks.tag': 'Request Received',
            'thanks.title': 'Thank You for<br><em>Reaching Out</em>',
            'thanks.body': 'Your sponsorship request has been submitted successfully. Our team will review your application and follow up with you within <strong style="color: rgba(245,240,232,0.85);">5–7 business days</strong>.',
            'thanks.home': 'Back to Home',
            'thanks.visit': 'Visit ZTEX Construction',

            // Runtime strings (main.js)
            'toast.maxFiles': 'Maximum {n} files allowed',
            'toast.fileTooBig': '"{name}" exceeds 10MB limit',
            'toast.fileType': '"{name}" isn\'t a supported file type',
            'toast.totalSize': 'Attachments can total 20MB at most',
            'toast.duplicate': '"{name}" already added',
            'toast.uploadFailed': 'A file failed to upload. Please try again or call (915) 591-6900.',
            'toast.genericError': 'Something went wrong. Please try again or call (915) 591-6900.',
            'upload.progress': 'Uploading file {i} of {n} ({pct}%)...'
        },
        es: {
            // Meta
            'meta.title': 'ZTEX Construction — Solicitudes de patrocinio',
            'meta.description': 'Envíe su solicitud de patrocinio a ZTEX Construction, Inc.',
            'meta.thanksTitle': 'Solicitud recibida — ZTEX Construction',
            'meta.thanksDescription': 'Hemos recibido su solicitud de patrocinio. ZTEX Construction le dará respuesta en un plazo de 5 a 7 días hábiles.',

            // Navigation + language toggle
            'nav.about': 'Acerca de',
            'nav.apply': 'Solicitar',
            'nav.mainSite': 'Sitio principal',
            'lang.label': 'Idioma',
            'lang.en': 'Inglés',
            'lang.es': 'Español',

            // Hero
            'hero.badge': 'Inversión comunitaria',
            'hero.title1': 'Solicitudes de',
            'hero.title2': 'patrocinio',
            'hero.subtitle': 'En ZTEX Construction nos enorgullece invertir en las comunidades que construimos. Envíe su solicitud de patrocinio a continuación y hagamos la diferencia juntos.',
            'hero.cta': 'Enviar una solicitud',
            'hero.scroll': 'Deslice',

            // About
            'about.tag': 'Nuestro compromiso',
            'about.title': 'Inversión<br><em>comunitaria</em>',
            'about.p1': 'Por más de dos décadas, ZTEX Construction ha sido más que un contratista de obra civil pesada: hemos sido un pilar de las comunidades de El Paso y el sur de Nuevo México. Nuestro programa de patrocinios refleja nuestra convicción de que construir comunidades más fuertes empieza más allá de la obra.',
            'about.p2': 'Recibimos con gusto solicitudes de patrocinio de organizaciones, eventos y causas que compartan nuestros valores de integridad, comunidad y crecimiento.',
            'about.statYears': 'Años sirviendo a El Paso',
            'about.statTeam': 'Integrantes del equipo',
            'about.statStates': 'Estados: TX y NM',

            // Form header + progress
            'form.tag': 'Comience aquí',
            'form.title': 'Envíe su<br><em>solicitud de patrocinio</em>',
            'form.intro': 'Complete el siguiente formulario con los datos de su organización y de su evento. Nuestro equipo revisará su solicitud y le dará respuesta en un plazo de 5 a 7 días hábiles.',
            'form.step1': 'Organización',
            'form.step2': 'Detalles del evento',
            'form.step3': 'Archivos y envío',
            'form.continue': 'Continuar',
            'form.back': 'Atrás',
            'form.submit': 'Enviar solicitud',
            'form.submitting': 'Enviando...',

            // Step 1
            'field.orgName': 'Nombre de la organización o empresa',
            'field.orgName.placeholder': 'Nombre de su organización',
            'field.orgName.error': 'Ingrese el nombre de su organización',
            'field.contactName': 'Nombre del contacto',
            'field.contactName.placeholder': 'Nombre completo',
            'field.contactName.error': 'Ingrese el nombre del contacto',
            'field.email': 'Correo electrónico',
            'field.email.placeholder': 'correo@ejemplo.com',
            'field.email.error': 'Ingrese un correo electrónico válido',
            'field.phone': 'Número de teléfono',
            'field.phone.error': 'Ingrese un número de teléfono',

            // Step 2
            'field.eventName': 'Nombre del evento o patrocinio',
            'field.eventName.placeholder': 'Nombre del evento o de la iniciativa',
            'field.eventName.error': 'Ingrese el nombre del evento',
            'field.eventDate': 'Fecha del evento',
            'field.eventDate.error': 'Ingrese la fecha del evento',
            'field.eventTime': 'Hora de inicio del evento (hora de la montaña, MT)',
            'field.amount': 'Monto de patrocinio solicitado',
            'field.tier': 'Nivel o categoría de patrocinio',
            'tier.select': 'Seleccione un nivel (si aplica)',
            'tier.titleSponsor': 'Patrocinador principal',
            'tier.platinum': 'Platino',
            'tier.gold': 'Oro',
            'tier.silver': 'Plata',
            'tier.bronze': 'Bronce',
            'tier.inKind': 'En especie',
            'tier.notApplicable': 'No aplica',
            'tier.other': 'Otro',
            'field.tierOther': 'Describa el nivel o categoría',
            'field.tierOther.placeholder': 'p. ej., patrocinador de hoyo, derechos de nombre',
            'field.tierOther.error': 'Describa el nivel de patrocinio',
            'field.description': 'Descripción del evento o causa',
            'field.description.placeholder': 'Cuéntenos sobre su evento, su propósito, la asistencia esperada y cómo el patrocinio de ZTEX haría la diferencia...',
            'field.description.error': 'Ingrese una descripción',

            // Step 3
            'files.label': 'Adjuntar archivos',
            'files.hint': 'Adjunte volantes, propuestas, detalles del evento o cualquier documento de apoyo. (Máx. 10 MB por archivo, 20 MB en total, hasta 5 archivos)',
            'files.drop': 'Arrastre y suelte sus archivos aquí, o <span class="file-upload-browse">selecciónelos</span>',
            'files.formats': 'PDF, JPG, PNG, DOC, DOCX — Máx. 10 MB cada uno',
            'files.remove': 'Quitar archivo',
            'field.notes': 'Notas adicionales',
            'field.notes.placeholder': 'Cualquier otra información que desee compartir...',

            // Inline success (kept for resetForm)
            'success.title': '¡Solicitud enviada!',
            'success.text': 'Gracias por su solicitud de patrocinio. Nuestro equipo la revisará y se comunicará con usted en un plazo de 5 a 7 días hábiles.',
            'success.again': 'Enviar otra solicitud',

            // Footer
            'footer.contact': 'Contacto',
            'footer.links': 'Enlaces',
            'footer.mainSite': 'Sitio web principal',
            'footer.projects': 'Nuestros proyectos',
            'footer.copyright': '© 2026 ZTEX Construction, Inc. Todos los derechos reservados.',
            'footer.eeo': 'ZTEX Construction INC. no discrimina por motivos de raza, color, religión, género, sexo, origen nacional, edad, discapacidad, condición militar, información genética ni por ningún otro motivo prohibido por la ley.',

            // Thanks page
            'thanks.tag': 'Solicitud recibida',
            'thanks.title': 'Gracias por<br><em>contactarnos</em>',
            'thanks.body': 'Su solicitud de patrocinio se envió correctamente. Nuestro equipo la revisará y se comunicará con usted en un plazo de <strong style="color: rgba(245,240,232,0.85);">5 a 7 días hábiles</strong>.',
            'thanks.home': 'Volver al inicio',
            'thanks.visit': 'Visitar ZTEX Construction',

            // Runtime strings (main.js)
            'toast.maxFiles': 'Se permiten máximo {n} archivos',
            'toast.fileTooBig': '"{name}" supera el límite de 10 MB',
            'toast.fileType': '"{name}" no es un tipo de archivo permitido',
            'toast.totalSize': 'Los archivos adjuntos no pueden superar 20 MB en total',
            'toast.duplicate': '"{name}" ya fue agregado',
            'toast.uploadFailed': 'No se pudo subir un archivo. Intente de nuevo o llame al (915) 591-6900.',
            'toast.genericError': 'Ocurrió un error. Intente de nuevo o llame al (915) 591-6900.',
            'upload.progress': 'Subiendo archivo {i} de {n} ({pct}%)...'
        }
    };

    // Error strings returned by /api/submit and /api/upload (the API itself stays English).
    // Exact matches first; patterned ones keep the file name. Anything else falls back to
    // toast.genericError in Spanish; English keeps showing the server's own text.
    const SERVER_ERRORS = [
        { en: 'Missing required fields', es: 'Faltan campos obligatorios.' },
        { en: 'Invalid email', es: 'El correo electrónico no es válido.' },
        { en: 'Please enter the event date.', es: 'Ingrese la fecha del evento.' },
        { en: 'Please enter a valid event date.', es: 'Ingrese una fecha de evento válida.' },
        { en: 'Please enter a valid start time.', es: 'Ingrese una hora de inicio válida.' },
        { en: 'Invalid tier.', es: 'El nivel de patrocinio no es válido.' },
        { en: 'Please describe the "Other" tier.', es: 'Describa el nivel de patrocinio "Otro".' },
        { en: '"Other" tier description: 100 characters max.', es: 'La descripción del nivel "Otro" debe tener máximo 100 caracteres.' },
        { en: 'Invalid attachments.', es: 'Los archivos adjuntos no son válidos.' },
        { en: 'Invalid attachment.', es: 'Uno de los archivos adjuntos no es válido.' },
        { en: 'Duplicate attachment.', es: 'Hay un archivo adjunto duplicado.' },
        { en: 'Maximum 5 files allowed.', es: 'Se permiten máximo 5 archivos.' },
        { en: 'An attachment is missing. Please re-attach your files and try again.', es: 'Falta un archivo adjunto. Vuelva a adjuntar sus archivos e intente de nuevo.' },
        { en: 'Attachments total more than 20MB.', es: 'Los archivos adjuntos suman más de 20 MB.' },
        { en: 'Too many uploads. Please try again later.', es: 'Demasiados archivos subidos. Intente de nuevo más tarde.' },
        { en: 'Invalid file name.', es: 'El nombre del archivo no es válido.' },
        { en: 'Upload failed.', es: 'No se pudo subir el archivo.' },
        { re: /^"(.+)" exceeds 10MB\.$/, en: '"{name}" exceeds 10MB.', es: '"{name}" supera los 10 MB.' },
        { re: /^"(.+)" isn't an allowed file type\.$/, en: '"{name}" isn\'t an allowed file type.', es: '"{name}" no es un tipo de archivo permitido.' }
    ];

    let lang = detectLang();
    const listeners = [];

    function detectLang() {
        let saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage blocked */ }
        if (LANGS.includes(saved)) return saved;
        const browser = (navigator.language || '').toLowerCase();
        return browser.indexOf('es') === 0 ? 'es' : 'en';
    }

    function format(str, vars) {
        if (!vars) return str;
        return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    }

    function t(key, vars) {
        const table = dict[lang] || dict.en;
        const str = key in table ? table[key] : (key in dict.en ? dict.en[key] : key);
        return format(str, vars);
    }

    // Translate a known server error; null when unknown so the caller picks its own fallback.
    function serverError(message) {
        const msg = String(message || '').trim();
        if (!msg) return null;
        for (const entry of SERVER_ERRORS) {
            if (entry.re) {
                const m = msg.match(entry.re);
                if (m) return format(entry[lang], { name: m[1] });
            } else if (entry.en === msg) {
                return entry[lang];
            }
        }
        return null;
    }

    function apply() {
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        // Markup comes only from the dictionary above, never from user input
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });
        ATTRS.forEach(attr => {
            document.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => {
                el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
            });
        });

        document.querySelectorAll('.lang-btn').forEach(btn => {
            const active = btn.getAttribute('data-lang') === lang;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function setLang(next) {
        if (!LANGS.includes(next)) return;
        lang = next;
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* storage blocked */ }
        apply();
        listeners.forEach(fn => fn(lang));
    }

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => setLang(btn.getAttribute('data-lang')));
    });

    apply();

    window.I18n = {
        t,
        serverError,
        setLang,
        get lang() { return lang; },
        onChange(fn) { listeners.push(fn); }
    };
})();
