#!/usr/bin/env python3
"""Hash-fenced, backend-only live download patch. No service or config operations."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re

SPEC = importlib.util.spec_from_file_location('sidebar_release', Path(__file__).with_name('sidebar-release.py'))
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)
KIND = 'browser-download-backend-v1'
STATE = r.OWNER + 'pw-session-state.ts'
STREAM = r.OWNER + 'interaction-stream.ts'
ROUTE = r.OWNER + 'routes/interact.ts'
SOURCE = [STATE, STREAM, ROUTE, r.OWNER + 'pw-session-contracts.ts']


def stage(target, build, output):
    r.check(output.is_relative_to(r.PROJECT) and not output.exists(), 'use a new project-local stage')
    r.check(not output.is_relative_to(target) and not target.is_relative_to(output)
            and not output.is_relative_to(build), 'stage overlaps input')
    candidates = {}
    old_state_path, old_state = r.owner_bundle(target / 'dist', STATE)
    _, built_state = r.owner_bundle(build / 'dist', STATE)
    old_routes_path, old_routes = r.owner_bundle(target / 'dist', STREAM)
    _, built_routes = r.owner_bundle(build / 'dist', STREAM)
    for unchanged in ['pw-download-capture.ts', 'navigation-guard.ts', 'pw-session-navigation.ts']:
        key = r.OWNER + unchanged
        _, a = r.owner_bundle(target / 'dist', key)
        _, b = r.owner_bundle(build / 'dist', key)
        r.check(r.regions(a)[key] == r.regions(b)[key], 'unchanged dependency drift: ' + key)
    state_region = r.regions(built_state)[STATE]
    r.check('function captureStreamDownloadsOnPage(' in state_region, 'stale capture producer')
    r.check('captureStreamDownloadsOnPage' not in old_state, 'already patched producer')
    state = old_state.replace(r.regions(old_state)[STATE], state_region, 1)
    # Existing export aliases remain byte-for-byte unchanged for all other consumers.
    state += '\nexport { captureStreamDownloadsOnPage, saveBrowserDownload };\n'
    routes = old_routes
    for key in [STREAM, ROUTE]:
        region = r.regions(built_routes)[key]
        r.check('afterDownload' in region, 'stale download cursor: ' + key)
        routes = routes.replace(r.regions(old_routes)[key], region, 1)
    r.check('as assertBrowserNavigationResultAllowed' in old_routes, 'missing existing result guard')
    r.check('captureStreamDownloadsOnPage' not in old_routes, 'already patched stream')
    routes = f'import {{ captureStreamDownloadsOnPage, saveBrowserDownload }} from "./{old_state_path.name}";\n' + routes
    candidates['dist/' + old_state_path.name] = state.encode()
    candidates['dist/' + old_routes_path.name] = routes.encode()
    for original, candidate, changed in [(old_state, state, [STATE]), (old_routes, routes, [STREAM, ROUTE])]:
        before, after = r.regions(original), r.regions(candidate)
        r.check(set(before) == set(after), 'region inventory changed')
        r.check(all(before[k] == after[k] for k in before if k not in changed), 'non-owner region changed')
    preserved = {'dist/' + p.name: r.sha(p.read_bytes()) for p in (target / 'dist').glob('*.js')
                 if 'dist/' + p.name not in candidates}
    preserved.update({p: r.digest_at(target, p) for p in ['package.json', 'dist/build-info.json']})
    output.mkdir(parents=True)
    records = []
    for name, data in candidates.items():
        original = r.safe(target, name).read_bytes()
        mode = r.safe(target, name).stat().st_mode & 0o777
        for section, contents in [('candidate', data), ('original', original)]:
            p = r.safe(output / section, name); p.parent.mkdir(parents=True, exist_ok=True)
            r.atomic(p, contents, mode)
        r.syntax(output / 'candidate' / name)
        for _, dependency in r.MODULES.findall(data.decode()):
            r.check((target / 'dist' / dependency).is_file(), 'unresolved dependency: ' + dependency)
        records.append(dict(path=name, before=r.sha(original), after=r.sha(data), mode=mode, current='before'))
    manifest = dict(kind=KIND, target_root=str(target), files=records, preserved=preserved, status='staged',
                    source={p:r.sha(r.safe(build,p).read_bytes()) for p in SOURCE})
    result = output / 'manifest.json'; r.save(result, manifest); verify(result, target)
    return result


def verify(path, target):
    m = r.read_json(path)
    r.check(m.get('kind') == KIND and m['target_root'] == str(target), 'manifest target mismatch')
    r.check(len(m['files']) == 2 and len({e['path'] for e in m['files']}) == 2, 'expected two unique backend files')
    r.check(sum(e['path'].startswith('dist/routes-') for e in m['files']) == 1, 'expected one routes owner')
    r.check(sum(e['path'].startswith('dist/pw-session-') for e in m['files']) == 1, 'expected one page-state owner')
    for e in m['files']:
        r.check(re.fullmatch(r'dist/(routes|pw-session)-[A-Za-z0-9_-]+\.js',e['path']), 'unexpected write target')
        for section, key in [('candidate','after'),('original','before')]:
            r.check(r.digest_at(path.parent / section,e['path']) == e[key], 'artifact drift')
        r.check(e['current'] in ('before','after'), 'invalid file state')
        r.check(r.digest_at(target,e['path']) == e[e['current']], 'installed file drift')
        r.syntax(path.parent/'candidate'/e['path'])
    for name, sha in m['preserved'].items():
        r.check(r.digest_at(target,name)==sha, 'preserved backend/identity drift: '+name)
    return m


def apply(path, target, rollback=False):
    lock=target/'dist/.sidebar-release.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600); retain=False
    try:
        os.write(fd,str(path).encode());os.fsync(fd)
        m=verify(path,target)
        r.check(m['status'] == ('applied' if rollback else 'staged'), 'phase already attempted')
        try:
            if rollback:
                r.restore(path,target,m,m['files']);m['status']='rolled_back'
            else:
                m['status']='applying';r.save(path,m)
                for e in m['files']:
                    r.check(r.digest_at(target,e['path'])==e['before'],'target changed before write')
                    data=r.safe(path.parent/'candidate',e['path']).read_bytes()
                    r.check(r.sha(data)==e['after'],'candidate changed before write')
                    r.atomic(r.safe(target,e['path']),data,e['mode'])
                    e['current']='after';r.save(path,m)
                m['status']='applied'
            r.save(path,m);verify(path,target)
        except BaseException:
            try:
                r.restore(path,target,m,m['files']);m['status']='failed';r.save(path,m)
            except BaseException:
                retain=True
            raise
    finally:
        os.close(fd)
        if not retain: lock.unlink()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode',choices=['stage','verify','apply','rollback'])
    p.add_argument('--target-root',type=Path,required=True)
    p.add_argument('--build-root',type=Path)
    p.add_argument('--output',type=Path)
    p.add_argument('--manifest',type=Path)
    a=p.parse_args();target=a.target_root.resolve()
    if a.mode=='stage':
        r.check(a.build_root and a.output,'stage needs build-root and output')
        result=stage(target,a.build_root.resolve(),a.output.resolve())
    else:
        r.check(a.manifest,'manifest required');result=a.manifest.resolve()
        if a.mode=='verify':verify(result,target)
        else:apply(result,target,a.mode=='rollback')
    print(result)

if __name__=='__main__':main()
