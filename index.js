const {
    app,
    Menu,
    MenuItem,
    Tray
} = require('electron'),
    path = require('path'),
    os = require('os'),
    child_proc = require('child_process');

const refresh_seconds = 10;

const
    booter = new(require(__dirname + '/libs/bootstrapper'))({
        refresh_seconds: refresh_seconds
    });

let tray = null;

const shouldQuit = app.makeSingleInstance((argv, wkdir) => {
    if (tray) {

    }
});

if (shouldQuit) {
    app.quit();
    return;
}

const launcher = function(m, w, e) {
    const gw = this;
    if (gw.started)
        return;
    const child_opts = {
        cwd: process.cwd(),
        detached: false,
        shell: false,
        env: {}
    };
    if (gw.name) {
        child_opts.env.CONTEXT_TITLE = gw.name;
        child_opts.env.SOCKS5_ADDRESS = gw.answers[0].targets[0];
        child_opts.env.SOCKS5_PORT = gw.answers[0].port;
    };
    const keys = Object.keys(process.env);
    keys.forEach(k => {
        child_opts.env[k] = process.env[k];
    });
    gw.proc = child_proc.spawn(path.join(process.cwd(), 'node_modules/.bin/electron' + (os.platform() === 'win32' ? '.cmd' : '')), ['main-entry.js'], child_opts);
    gw.proc.on('error', err => {
        console.log(err);
    });
    gw.proc.on('exit', function(code, sig) {
        this.started = false;
        this.proc = undefined;
        console.log(`process exited with code ${code}, sig: ${sig}`);
    }.bind(gw));
    if (gw.proc.stdout) {
        gw.proc.stdout.on('data', (data) => {
            console.log(`local-app: ${data}`);
        });
        gw.proc.stderr.on('data', (data) => {
            console.error(`local-app: ${data}`);
        });
    }
    gw.started = true;
};

let gateway_ports = [];
let last_update = undefined;

app.on('window-all-closed', () => {
    app_register.close();
    stateUpdator.flush().then(() => {
        return mainDB.close().then(() => {
            if (process.platform != 'darwin') {
                app.quit();
            }
        });
    });
});

const updator = () => {
    return booter.update_ports().then(r => {
        const old_ports = gateway_ports.map(p => p);
        gateway_ports = [];
        last_update = (new Date()).getTime();
        r.ports.forEach(gwp => {
            const old = old_ports.find(p => p.name === gwp.name);
            if (old) {
                gwp.proc = old.proc;
                gwp.started = old.started;
            }
            gateway_ports.push(gwp);
        });
        if (r.more) {
            r.more.on('more', function(gwp) {
                const old = this.find(p => p.name === gwp.name);
                if (old) {
                    gwp.proc = old.proc;
                    gwp.started = old.started;
                }
                gateway_ports.push(gwp);
            }.bind(old_ports));
        }
        setTimeout(function() {
            if (this.more) {
                this.more.removeAllListeners('more');
                this.more = undefined;
            }
            booter.close();
        }.bind(r), 10000);
    });
};

const local_browser = {
    started: false
};

app.on('ready', () => {
    booter.update_ports().then(r => {
        last_update = (new Date()).getTime();
        const getMenu = (gw_lst) => {
            const contextMenu = new Menu();
            contextMenu.append(new MenuItem({
                icon: 'client/img//blue-dot.png',
                label: 'Local Brosing',
                sublabel: 'Start browsing local resources ...',
                click: launcher.bind(local_browser)
            }));
            contextMenu.append(new MenuItem({
                type: 'separator'
            }));
            gw_lst.sort((a, b) => a.name > b.name ? 1 : -1).filter(gw => gw.serving).forEach(gw => {
                contextMenu.append(new MenuItem({
                    icon: 'client/img/green-dot.png',
                    label: gw.name,
                    sublabel: gw.descr || ' ... ',
                    click: launcher.bind(gw)
                }));
            });
            contextMenu.append(new MenuItem({
                type: 'separator'
            }));
            contextMenu.append(new MenuItem({
                label: 'Exit',
                click: (m, w, e) => {
                    app.quit();
                }
            }));
            return contextMenu;
        };
        r.ports.forEach(gwp => {
            gateway_ports.push(gwp);
        });
        r.more.on('more', (gwp) => {
            gateway_ports.push(gwp);
        });
        tray = new Tray('client/img/main-icon.png');
        tray.on('click', (e, b) => {
            const now = (new Date()).getTime();
            if (now - last_update > refresh_seconds * 1000) {
                updator().then(() => {
                    tray.setContextMenu(getMenu(gateway_ports));
                    tray.popUpContextMenu();
                });
            } else {
                tray.setContextMenu(getMenu(gateway_ports));
                tray.popUpContextMenu();
            }
        });
        tray.on('right-click', (e) => {
            e.preventDefault();
        });
        tray.setToolTip('1-NET Trans-LAN Remote Desktop');
        setTimeout(function() {
            if (this.more) {
                this.more.removeAllListeners('more');
                this.more = undefined;
            }
            booter.close();
        }.bind(r), 10000);
    });
});