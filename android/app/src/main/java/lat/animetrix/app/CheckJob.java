package lat.animetrix.app;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Tarea en segundo plano que revisa novedades cada ~30 minutos. */
public class CheckJob extends JobService {
    private Thread worker;

    @Override
    public boolean onStartJob(JobParameters params) {
        worker = new Thread(() -> {
            try { Notifier.check(getApplicationContext()); }
            finally { jobFinished(params, false); }
        }, "animetrix-check");
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        if (worker != null) worker.interrupt();
        return true; // reintentar más tarde
    }
}
