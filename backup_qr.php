<?php
/**
 * Script de Backup para carpeta QR con envío por Email
 * Dominio: colmenaideas.com.ar
 * 
 * USO:
 * - Web: https://colmenaideas.com.ar/backup_qr.php?key=TU_CLAVE_SECRETA
 * - Cron: /usr/local/bin/php /home/colmenai/public_html/backup_qr.php cron TU_CLAVE_SECRETA
 */

// ============================================
// CONFIGURACIÓN - MODIFICAR ESTOS VALORES
// ============================================

$config = [
    // Seguridad
    'clave_secreta'     => '19015yaCcT68UvWdnrpT',  // Clave secreta configurada
    
    // Carpetas
    'carpeta_origen'    => __DIR__ . '/qr',           // Carpeta a respaldar
    'carpeta_backups'   => __DIR__ . '/backups_qr',   // Donde se guardan los backups
    'max_backups'       => 10,                        // Máximo de backups a mantener
    
    // Email
    'email_destino'     => 'julioalvarez75@gmail.com',    // Email donde recibir el backup
    'email_remitente'   => 'admin@colmenaideas.com.ar',
    'email_nombre'      => 'Backup Colmena Ideas',
    
    // Configuración SMTP (opcional - dejar vacío para usar mail() de PHP)
    'smtp_usar'         => false,                     // Cambiar a true para usar SMTP
    'smtp_host'         => 'smtp.gmail.com',          // Servidor SMTP
    'smtp_puerto'       => 587,                       // Puerto (587 para TLS, 465 para SSL)
    'smtp_usuario'      => '',                        // Usuario SMTP
    'smtp_password'     => '',                        // Contraseña SMTP
    'smtp_seguridad'    => 'tls',                     // 'tls' o 'ssl'
    
    // Otros
    'zona_horaria'      => 'America/Argentina/Buenos_Aires',
    'max_tamano_email'  => 25 * 1024 * 1024,          // 25MB máximo para adjuntos
];

// ============================================
// NO MODIFICAR DEBAJO DE ESTA LÍNEA
// ============================================

date_default_timezone_set($config['zona_horaria']);

class BackupQR {
    private $config;
    private $mensajes = [];
    private $es_cron = false;

    public function __construct($config) {
        $this->config = $config;
        $this->es_cron = (php_sapi_name() === 'cli');
    }

    public function ejecutar($clave_proporcionada) {
        // Verificar clave de seguridad
        if ($clave_proporcionada !== $this->config['clave_secreta']) {
            $this->error("Acceso denegado: clave incorrecta");
            return false;
        }

        $this->log("=== Inicio de Backup QR ===");
        $this->log("Fecha: " . date('Y-m-d H:i:s'));

        // Verificar que existe la carpeta origen
        if (!is_dir($this->config['carpeta_origen'])) {
            $this->error("La carpeta QR no existe: " . $this->config['carpeta_origen']);
            return false;
        }

        // Crear carpeta de backups si no existe
        if (!is_dir($this->config['carpeta_backups'])) {
            if (!mkdir($this->config['carpeta_backups'], 0755, true)) {
                $this->error("No se pudo crear la carpeta de backups");
                return false;
            }
            $this->log("Carpeta de backups creada");
            $this->protegerCarpeta();
        }

        // Generar nombre del archivo
        $nombre_backup = 'backup_QR_' . date('Y-m-d_H-i-s') . '.zip';
        $ruta_backup = $this->config['carpeta_backups'] . '/' . $nombre_backup;

        // Crear el backup
        $resultado = $this->crearZip($this->config['carpeta_origen'], $ruta_backup);

        if ($resultado) {
            $tamano = filesize($ruta_backup);
            $tamano_formateado = $this->formatearTamano($tamano);
            $this->log("Backup creado exitosamente: $nombre_backup ($tamano_formateado)");
            
            // Enviar por email
            $this->enviarEmail($ruta_backup, $nombre_backup, $tamano);
            
            // Limpiar backups antiguos
            $this->limpiarBackupsAntiguos();
            
            $this->log("=== Backup completado ===");
            return true;
        } else {
            $this->error("Error al crear el backup");
            $this->enviarEmailError();
            return false;
        }
    }

    private function crearZip($origen, $destino) {
        if (!extension_loaded('zip')) {
            $this->error("Extensión ZIP no disponible en PHP");
            return false;
        }

        $zip = new ZipArchive();
        if ($zip->open($destino, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            $this->error("No se pudo crear el archivo ZIP");
            return false;
        }

        $origen = realpath($origen);
        $archivos_agregados = 0;

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($origen, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $archivo) {
            $ruta_real = $archivo->getRealPath();
            $ruta_relativa = 'QR/' . substr($ruta_real, strlen($origen) + 1);

            if ($archivo->isDir()) {
                $zip->addEmptyDir($ruta_relativa);
            } else {
                $zip->addFile($ruta_real, $ruta_relativa);
                $archivos_agregados++;
            }
        }

        $zip->close();
        $this->log("Archivos incluidos en el backup: $archivos_agregados");
        return true;
    }

    private function enviarEmail($ruta_backup, $nombre_backup, $tamano) {
        $destino = $this->config['email_destino'];
        
        if (empty($destino)) {
            $this->error("No se configuró email de destino");
            return false;
        }

        // Verificar tamaño del archivo
        if ($tamano > $this->config['max_tamano_email']) {
            $this->log("⚠️ Archivo muy grande para adjuntar (" . $this->formatearTamano($tamano) . ")");
            $this->log("Se enviará notificación sin adjunto");
            return $this->enviarEmailNotificacion($nombre_backup, $tamano);
        }

        $this->log("Enviando backup por email a: $destino");

        if ($this->config['smtp_usar']) {
            return $this->enviarEmailSMTP($ruta_backup, $nombre_backup, $destino);
        } else {
            return $this->enviarEmailPHP($ruta_backup, $nombre_backup, $destino);
        }
    }

    private function enviarEmailPHP($ruta_backup, $nombre_backup, $destino) {
        $remitente = $this->config['email_remitente'];
        $nombre_remitente = $this->config['email_nombre'];
        
        $asunto = "Backup QR - " . date('d/m/Y H:i');
        
        // Leer el archivo
        $contenido_archivo = file_get_contents($ruta_backup);
        $contenido_base64 = chunk_split(base64_encode($contenido_archivo));
        
        // Generar boundary único
        $boundary = md5(time());
        
        // Headers
        $headers = "From: $nombre_remitente <$remitente>\r\n";
        $headers .= "Reply-To: $remitente\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: multipart/mixed; boundary=\"$boundary\"\r\n";
        
        // Cuerpo del mensaje
        $mensaje = "--$boundary\r\n";
        $mensaje .= "Content-Type: text/html; charset=UTF-8\r\n";
        $mensaje .= "Content-Transfer-Encoding: 7bit\r\n\r\n";
        
        $mensaje .= $this->generarCuerpoEmail($nombre_backup);
        
        $mensaje .= "\r\n--$boundary\r\n";
        $mensaje .= "Content-Type: application/zip; name=\"$nombre_backup\"\r\n";
        $mensaje .= "Content-Transfer-Encoding: base64\r\n";
        $mensaje .= "Content-Disposition: attachment; filename=\"$nombre_backup\"\r\n\r\n";
        $mensaje .= $contenido_base64;
        $mensaje .= "\r\n--$boundary--";
        
        // Enviar
        $resultado = mail($destino, $asunto, $mensaje, $headers);
        
        if ($resultado) {
            $this->log("✅ Email enviado correctamente");
            return true;
        } else {
            $this->error("❌ Error al enviar el email");
            return false;
        }
    }

    private function enviarEmailSMTP($ruta_backup, $nombre_backup, $destino) {
        // Verificar si PHPMailer está disponible
        $phpmailer_paths = [
            __DIR__ . '/vendor/autoload.php',
            __DIR__ . '/PHPMailer/PHPMailerAutoload.php',
            __DIR__ . '/phpmailer/PHPMailerAutoload.php',
        ];
        
        $phpmailer_encontrado = false;
        foreach ($phpmailer_paths as $path) {
            if (file_exists($path)) {
                require_once $path;
                $phpmailer_encontrado = true;
                break;
            }
        }
        
        if (!$phpmailer_encontrado) {
            $this->log("PHPMailer no encontrado, usando mail() de PHP");
            return $this->enviarEmailPHP($ruta_backup, $nombre_backup, $destino);
        }

        try {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            
            // Configuración SMTP
            $mail->isSMTP();
            $mail->Host = $this->config['smtp_host'];
            $mail->SMTPAuth = true;
            $mail->Username = $this->config['smtp_usuario'];
            $mail->Password = $this->config['smtp_password'];
            $mail->SMTPSecure = $this->config['smtp_seguridad'];
            $mail->Port = $this->config['smtp_puerto'];
            $mail->CharSet = 'UTF-8';
            
            // Remitente y destinatario
            $mail->setFrom($this->config['email_remitente'], $this->config['email_nombre']);
            $mail->addAddress($destino);
            
            // Contenido
            $mail->isHTML(true);
            $mail->Subject = "Backup QR - " . date('d/m/Y H:i');
            $mail->Body = $this->generarCuerpoEmail($nombre_backup);
            
            // Adjunto
            $mail->addAttachment($ruta_backup, $nombre_backup);
            
            $mail->send();
            $this->log("✅ Email enviado correctamente via SMTP");
            return true;
            
        } catch (Exception $e) {
            $this->error("❌ Error SMTP: " . $mail->ErrorInfo);
            return false;
        }
    }

    private function enviarEmailNotificacion($nombre_backup, $tamano) {
        $destino = $this->config['email_destino'];
        $remitente = $this->config['email_remitente'];
        $nombre_remitente = $this->config['email_nombre'];
        
        $asunto = "Backup QR Completado - " . date('d/m/Y H:i');
        
        $headers = "From: $nombre_remitente <$remitente>\r\n";
        $headers .= "Reply-To: $remitente\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        
        $mensaje = "
        <html>
        <body style='font-family: Arial, sans-serif;'>
            <h2>🗂️ Backup QR Completado</h2>
            <p><strong>Fecha:</strong> " . date('d/m/Y H:i:s') . "</p>
            <p><strong>Archivo:</strong> $nombre_backup</p>
            <p><strong>Tamaño:</strong> " . $this->formatearTamano($tamano) . "</p>
            <p style='color: #c00;'><strong>⚠️ El archivo es muy grande para adjuntar por email.</strong></p>
            <p>El backup se encuentra guardado en el servidor en:<br>
            <code>/backups_qr/$nombre_backup</code></p>
        </body>
        </html>";
        
        $resultado = mail($destino, $asunto, $mensaje, $headers);
        
        if ($resultado) {
            $this->log("✅ Notificación enviada (sin adjunto por tamaño)");
            return true;
        } else {
            $this->error("❌ Error al enviar notificación");
            return false;
        }
    }

    private function enviarEmailError() {
        $destino = $this->config['email_destino'];
        if (empty($destino)) return;
        
        $remitente = $this->config['email_remitente'];
        $nombre_remitente = $this->config['email_nombre'];
        
        $asunto = "⚠️ ERROR en Backup QR - " . date('d/m/Y H:i');
        
        $headers = "From: $nombre_remitente <$remitente>\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        
        $errores = "";
        foreach ($this->mensajes as $msg) {
            if ($msg['tipo'] === 'error') {
                $errores .= "<li>{$msg['texto']}</li>";
            }
        }
        
        $mensaje = "
        <html>
        <body style='font-family: Arial, sans-serif;'>
            <h2 style='color: #c00;'>⚠️ Error en Backup QR</h2>
            <p><strong>Fecha:</strong> " . date('d/m/Y H:i:s') . "</p>
            <p><strong>Errores detectados:</strong></p>
            <ul>$errores</ul>
            <p>Por favor revisa la configuración del backup.</p>
        </body>
        </html>";
        
        mail($destino, $asunto, $mensaje, $headers);
    }

    private function generarCuerpoEmail($nombre_backup) {
        $resumen = "";
        foreach ($this->mensajes as $msg) {
            $icono = $msg['tipo'] === 'error' ? '❌' : '✓';
            $resumen .= "<li>$icono {$msg['texto']}</li>";
        }
        
        return "
        <html>
        <body style='font-family: Arial, sans-serif; max-width: 600px;'>
            <h2 style='color: #2c5530;'>🗂️ Backup QR - Colmena Ideas</h2>
            <p><strong>Fecha:</strong> " . date('d/m/Y H:i:s') . "</p>
            <p><strong>Archivo adjunto:</strong> $nombre_backup</p>
            
            <h3>Resumen de la operación:</h3>
            <ul style='background: #f5f5f5; padding: 15px 30px; border-radius: 5px;'>
                $resumen
            </ul>
            
            <p style='color: #666; font-size: 12px; margin-top: 30px;'>
                Este es un mensaje automático del sistema de backup.<br>
                Dominio: colmenaideas.com.ar
            </p>
        </body>
        </html>";
    }

    private function limpiarBackupsAntiguos() {
        $archivos = glob($this->config['carpeta_backups'] . '/backup_QR_*.zip');
        
        if (count($archivos) > $this->config['max_backups']) {
            usort($archivos, function($a, $b) {
                return filemtime($a) - filemtime($b);
            });

            $a_eliminar = count($archivos) - $this->config['max_backups'];
            for ($i = 0; $i < $a_eliminar; $i++) {
                unlink($archivos[$i]);
                $this->log("Backup antiguo eliminado: " . basename($archivos[$i]));
            }
        }
    }

    private function protegerCarpeta() {
        $htaccess = $this->config['carpeta_backups'] . '/.htaccess';
        $contenido = "Order Deny,Allow\nDeny from all\n";
        file_put_contents($htaccess, $contenido);
        $this->log("Carpeta de backups protegida con .htaccess");
    }

    private function formatearTamano($bytes) {
        $unidades = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($unidades) - 1) {
            $bytes /= 1024;
            $i++;
        }
        return round($bytes, 2) . ' ' . $unidades[$i];
    }

    private function log($mensaje) {
        $this->mensajes[] = ['tipo' => 'info', 'texto' => $mensaje];
    }

    private function error($mensaje) {
        $this->mensajes[] = ['tipo' => 'error', 'texto' => $mensaje];
    }

    public function mostrarResultado() {
        if ($this->es_cron) {
            foreach ($this->mensajes as $msg) {
                echo ($msg['tipo'] === 'error' ? '[ERROR] ' : '') . $msg['texto'] . "\n";
            }
        } else {
            echo "<!DOCTYPE html><html><head><meta charset='utf-8'>";
            echo "<title>Backup QR</title>";
            echo "<style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .log { background: #f5f5f5; padding: 15px; border-radius: 5px; }
                .info { color: #333; margin: 8px 0; }
                .error { color: #c00; font-weight: bold; margin: 8px 0; }
                h1 { color: #333; }
            </style></head><body>";
            echo "<h1>🗂️ Backup QR</h1><div class='log'>";
            foreach ($this->mensajes as $msg) {
                echo "<p class='{$msg['tipo']}'>{$msg['texto']}</p>";
            }
            echo "</div></body></html>";
        }
    }
}

// Obtener clave según el método de ejecución
$clave = '';
if (php_sapi_name() === 'cli') {
    $clave = isset($argv[2]) ? $argv[2] : '';
} else {
    $clave = isset($_GET['key']) ? $_GET['key'] : '';
}

$backup = new BackupQR($config);
$backup->ejecutar($clave);
$backup->mostrarResultado();
